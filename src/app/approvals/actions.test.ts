import { describe, it, expect, vi, beforeAll } from "vitest";
import { pool } from "@/db/test-pool";
import { submitQuoteForApproval, approveQuote, rejectQuote } from "./actions";

const mockUser = {
  id: 2,
  email: "saleshead@companya.in",
  role: "sales_head" as const,
};

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => mockUser),
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(mockUser.role)) {
      throw new Error(`Forbidden: requires ${roles.join(" or ")}`);
    }
    return mockUser;
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
    // 1. Ensure user
    const uRes = await pool.query(
      `INSERT INTO users (email, role, password_hash)
       VALUES ('saleshead@companya.in', 'sales_head', 'hash')
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`
    );
    mockUser.id = uRes.rows[0].id;

    // 2. Ensure customer
    const cRes = await pool.query(
      `INSERT INTO customers (name)
       VALUES ('Approval Test Corp')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    customerId = cRes.rows[0].id;

    // 3. Ensure rates exist
    await pool.query(
      `INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from)
       VALUES ('EN8', 60.00, 30.00, '2026-01-01')
       ON CONFLICT (grade, effective_from) DO NOTHING`
    );
    await pool.query(
      `INSERT INTO rate_machines (machine_code, hour_rate, effective_from)
       VALUES ('CNC-01', 850.00, '2026-01-01')
       ON CONFLICT (machine_code, effective_from) DO NOTHING`
    );
    const params = [
      ["overhead_pct", "0.1500"],
      ["packing_per_unit", "1.50"],
      ["freight_per_kg", "2.00"],
      ["gst_pct", "0.1800"],
    ];
    for (const [k, v] of params) {
      await pool.query(
        `INSERT INTO rate_params (key, value, effective_from)
         VALUES ($1, $2, '2026-01-01')
         ON CONFLICT (key, effective_from) DO NOTHING`,
        [k, v]
      );
    }

    // 4. Create RFQ & Quote with unique number
    const rfqNo = `RFQ-APPR-${Date.now()}`;
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, owner_id, due_date, status)
       VALUES ($1, $2, $3, '2026-11-30', 'estimating')
       RETURNING id`,
      [rfqNo, customerId, mockUser.id]
    );
    testRfqId = rfqRes.rows[0].id;

    const qRes = await pool.query(
      `INSERT INTO quotes (rfq_id, version, status, as_of_date)
       VALUES ($1, 1, 'draft', '2026-01-01')
       RETURNING id`,
      [testRfqId]
    );
    testQuoteId = qRes.rows[0].id;

    // 5. Create Part (Volume: 50,000 pcs, high value > ₹25L)
    const pRes = await pool.query(
      `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years)
       VALUES ($1, 'High Value Hub', 'EN8', 1.500, 0.0800, 50000, 50000, 2.0)
       RETURNING id`,
      [testRfqId]
    );
    testPartId = pRes.rows[0].id;

    // 6. Create Routing Op
    await pool.query(
      `INSERT INTO routing_ops (part_id, seq, op_name, machine_code, cycle_min, setup_min)
       VALUES ($1, 1, 'Heavy Turning', 'CNC-01', 4.500, 60.00)`,
      [testPartId]
    );

    // 7. Create 3 Tiers
    const tiers = [
      [1, 25000, 2000, 0.12],
      [2, 50000, 4000, 0.12],
      [3, 100000, 8000, 0.12],
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

  it("submits high-value quote (> ₹25L) into 'pending_approval' status", async () => {
    const res = await submitQuoteForApproval(testQuoteId);
    expect(res.success).toBe(true);
    expect(res.status).toBe("pending_approval");

    const row = await pool.query(`SELECT status FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(row.rows[0].status).toBe("pending_approval");
  });

  it("sales head can reject quote with mandatory reason", async () => {
    const rejRes = await rejectQuote(testQuoteId, "Customer budget capped at ₹120 per unit");
    expect(rejRes.success).toBe(true);
    expect(rejRes.status).toBe("rejected");

    const row = await pool.query(`SELECT status, rejection_reason FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(row.rows[0].status).toBe("rejected");
    expect(row.rows[0].rejection_reason).toBe("Customer budget capped at ₹120 per unit");
  });

  it("re-submitting forwards quote back to pending_approval", async () => {
    const res = await submitQuoteForApproval(testQuoteId);
    expect(res.status).toBe("pending_approval");
  });

  it("sales head approves quote, creating immutable snapshot", async () => {
    const appRes = await approveQuote(testQuoteId);
    expect(appRes.success).toBe(true);
    expect(appRes.status).toBe("approved");

    // Check quote status
    const qRow = await pool.query(`SELECT status, approved_by FROM quotes WHERE id = $1`, [testQuoteId]);
    expect(qRow.rows[0].status).toBe("approved");
    expect(qRow.rows[0].approved_by).toBe(mockUser.id);

    // Check snapshot created
    const snapRows = await pool.query(
      `SELECT * FROM quote_snapshots WHERE quote_id = $1 ORDER BY snapshot_no DESC`,
      [testQuoteId]
    );
    expect(snapRows.rows.length).toBeGreaterThan(0);
    expect(snapRows.rows[0].payload).toBeDefined();

    // Verify idempotency
    const secondCall = await approveQuote(testQuoteId);
    expect(secondCall.success).toBe(true);
    expect(secondCall.status).toBe("approved");
  });

  it("rejects submitting quote when already approved or sent (status whitelist)", async () => {
    // Quote is now approved: submitting returns early with status 'approved'
    const res = await submitQuoteForApproval(testQuoteId);
    expect(res.status).toBe("approved");

    // If status is 'sent', submitting throws an error
    await pool.query(`UPDATE quotes SET status = 'sent' WHERE id = $1`, [testQuoteId]);
    await expect(submitQuoteForApproval(testQuoteId)).rejects.toThrow(/Cannot submit quote in status 'sent'/);
  });
});
