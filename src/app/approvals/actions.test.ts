import { describe, it, expect, vi, beforeAll } from "vitest";
import { pool } from "@/db/test-pool";
import { submitQuoteForApproval, approveQuote, rejectQuote, markQuoteSent } from "./actions";

let currentRole: "estimator" | "sales_head" = "estimator";

const mockUser = {
  id: 2,
  email: "saleshead@companya.in",
  role: "sales_head" as const,
};

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ ...mockUser, role: currentRole })),
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(currentRole)) {
      throw new Error(`Forbidden: requires ${roles.join(" or ")}`);
    }
    return { ...mockUser, role: currentRole };
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Approval Workflow Integration", () => {
  let customerId: number;
  let testQuoteId: number;
  let testRfqId: number;
  let testPartId: number;

  beforeAll(async () => {
    // 1. Ensure test customer exists
    const cRes = await pool.query(
      `INSERT INTO customers (name) VALUES ('Approval Test OEM')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    customerId = cRes.rows[0].id;

    // 2. Ensure test user exists
    const uRes = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('saleshead@companya.in', '$2a$10$xyz', 'sales_head')
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`
    );
    mockUser.id = uRes.rows[0].id;

    // 3. Ensure rate masters exist for testing asOfDate
    await pool.query(
      `INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from)
       VALUES ('EN8', '72.0000', '25.0000', '2026-01-01')
       ON CONFLICT DO NOTHING`
    );
    await pool.query(
      `INSERT INTO rate_machines (machine_code, hour_rate, effective_from)
       VALUES ('M-850', '850.00', '2026-01-01')
       ON CONFLICT DO NOTHING`
    );
    const params = [
      ["overhead_pct", "0.120000"],
      ["packing_per_unit", "1.200000"],
      ["freight_per_kg", "2.500000"],
      ["gst_pct", "0.180000"],
    ];
    for (const [k, v] of params) {
      await pool.query(
        `INSERT INTO rate_params (key, value, effective_from)
         VALUES ($1, $2, '2026-01-01')
         ON CONFLICT DO NOTHING`,
        [k, v]
      );
    }

    // 4. Create an RFQ and Part
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
       VALUES ('RFQ-TEST-APPROV', $1, '2026-12-01', $2, 'estimating')
       ON CONFLICT (rfq_no) DO UPDATE SET due_date = EXCLUDED.due_date
       RETURNING id`,
      [customerId, mockUser.id]
    );
    testRfqId = rfqRes.rows[0].id;

    const pRes = await pool.query(
      `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years)
       VALUES ($1, 'Spindle Shaft', 'EN8', '0.610', '0.0800', 180000, '0', '2.0')
       RETURNING id`,
      [testRfqId]
    );
    testPartId = pRes.rows[0].id;

    // 5. Add routing op
    await pool.query(
      `INSERT INTO routing_ops (part_id, seq, op_name, machine_code, cycle_min, setup_min)
       VALUES ($1, 1, 'CNC Turning', 'M-850', '3.200', '45.00')`,
      [testPartId]
    );

    // 6. Create Draft Quote
    const qRes = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date)
       VALUES ($1, 'draft', 1, '2026-01-01')
       RETURNING id`,
      [testRfqId]
    );
    testQuoteId = qRes.rows[0].id;

    // 7. Seed 3 tiers for the quote
    const tiers = [
      [1, 90000, "7500", "0.1200"],
      [2, 180000, "15000", "0.1200"],
      [3, 360000, "30000", "0.1200"],
    ];
    for (const [tNo, vol, lot, m] of tiers) {
      await pool.query(
        `INSERT INTO quote_part_tiers (quote_id, part_id, tier_no, volume, lot_size, margin_pct)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (quote_id, part_id, tier_no) DO UPDATE SET volume = EXCLUDED.volume`,
        [testQuoteId, testPartId, tNo, vol, lot, m]
      );
    }
  });

  it("submits high-value quote (> ₹25L) into 'pending_approval' status as estimator", async () => {
    currentRole = "estimator";
    const res = await submitQuoteForApproval(testQuoteId);
    expect(res.success).toBe(true);
    expect(res.status).toBe("pending_approval");

    const row = await pool.query(`SELECT status FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(row.rows[0].status).toBe("pending_approval");
  });

  it("sales head can reject quote with mandatory reason, returning to draft", async () => {
    currentRole = "sales_head";
    const rejRes = await rejectQuote(testQuoteId, "Customer budget capped at ₹120 per unit");
    expect(rejRes.success).toBe(true);
    expect(rejRes.status).toBe("draft");

    const row = await pool.query(`SELECT status, rejection_reason FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(row.rows[0].status).toBe("draft");
    expect(row.rows[0].rejection_reason).toBe("Customer budget capped at ₹120 per unit");
  });

  it("re-submitting forwards quote back to pending_approval", async () => {
    currentRole = "estimator";
    const res = await submitQuoteForApproval(testQuoteId);
    expect(res.status).toBe("pending_approval");
  });

  it("sales head approves quote, creating immutable snapshot with rateRefs", async () => {
    currentRole = "sales_head";
    const appRes = await approveQuote(testQuoteId);
    expect(appRes.success).toBe(true);
    expect(appRes.status).toBe("approved");

    // Check quote status
    const qRow = await pool.query(`SELECT status, approved_by FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(qRow.rows[0].status).toBe("approved");
    expect(qRow.rows[0].approved_by).toBe(mockUser.id);

    // Check snapshot created with rateRefs
    const snapRows = await pool.query(
      `SELECT * FROM quote_snapshots WHERE quote_id = $1 ORDER BY snapshot_no DESC`,
      [testQuoteId]
    );
    expect(snapRows.rows.length).toBeGreaterThan(0);
    const snap = snapRows.rows[0];
    expect(snap.payload).toBeDefined();
    expect(snap.payload.rateRefs).toBeDefined();
    expect(snap.payload.rateRefs.length).toBeGreaterThan(0);

    // Verify idempotency
    const secondCall = await approveQuote(testQuoteId);
    expect(secondCall.success).toBe(true);
    expect(secondCall.status).toBe("approved");
  });

  it("sales head can mark approved quote as sent, updating both quote and RFQ", async () => {
    currentRole = "sales_head";
    const sentRes = await markQuoteSent(testQuoteId);
    expect(sentRes.success).toBe(true);
    expect(sentRes.status).toBe("sent");

    const qRow = await pool.query(`SELECT status FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(qRow.rows[0].status).toBe("sent");

    const rfqRow = await pool.query(`SELECT status FROM rfqs WHERE id = $1`, [testRfqId]);
    expect(rfqRow.rows[0].status).toBe("sent");
  });

  it("rejects submitting quote when already approved or sent (status whitelist)", async () => {
    currentRole = "estimator";
    await expect(submitQuoteForApproval(testQuoteId)).rejects.toThrow();
  });
});
