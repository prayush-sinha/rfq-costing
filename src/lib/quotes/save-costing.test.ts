import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { pool } from "@/db/test-pool";

const { mockState } = vi.hoisted(() => ({
  mockState: { role: "estimator" as "estimator" | "sales_head", userId: 1 },
}));

vi.mock("@/lib/auth/guards", () => {
  class ForbiddenError extends Error {
    constructor(message = "Forbidden: insufficient permissions") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  return {
    ForbiddenError,
    requireRole: vi.fn(async (expectedRole: string) => {
      if (mockState.role !== expectedRole) {
        throw new ForbiddenError(`Role '${mockState.role}' is not authorized for this action`);
      }
      return { id: mockState.userId, email: "estimator@companya.in", role: mockState.role };
    }),
  };
});

import { saveCosting } from "./actions";
import { ConflictError } from "./errors";

describe("saveCosting optimistic locking & role enforcement", () => {
  let quoteId: number;
  let partId: number;
  let initialVersion: number;

  beforeAll(async () => {
    // Ensure test user exists
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('costing_test_estimator@companya.in', 'dummy', 'estimator')
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id;
    `);
    mockState.userId = userRes.rows[0].id;

    // Ensure test customer exists
    const custRes = await pool.query(`
      INSERT INTO customers (name)
      VALUES ('Costing Save Test Customer')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const custId = custRes.rows[0].id;

    // Create test RFQ
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
       VALUES ('RFQ-TEST-COST-001', $1, '2026-12-15', $2, 'estimating')
       ON CONFLICT (rfq_no) DO UPDATE SET status = 'estimating'
       RETURNING id;`,
      [custId, mockState.userId]
    );
    const rfqId = rfqRes.rows[0].id;

    // Create test Part
    const partRes = await pool.query(
      `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years)
       VALUES ($1, 'Costing Test Part', 'EN8', '0.610', '0.0800', 180000, '0', '2.0')
       RETURNING id;`,
      [rfqId]
    );
    partId = partRes.rows[0].id;

    // Create test Quote in draft status with version 1
    const quoteRes = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date)
       VALUES ($1, 'draft', 1, '2026-11-04')
       RETURNING id, version;`,
      [rfqId]
    );
    quoteId = quoteRes.rows[0].id;
    initialVersion = quoteRes.rows[0].version;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM audit_log WHERE entity = 'quote' AND entity_id = $1", [
      String(quoteId),
    ]);
    await pool.query("DELETE FROM quote_part_tiers WHERE quote_id = $1", [quoteId]);
    await pool.query("DELETE FROM quotes WHERE id = $1", [quoteId]);
    await pool.query("DELETE FROM routing_ops WHERE part_id = $1", [partId]);
    await pool.query("DELETE FROM parts WHERE id = $1", [partId]);
    await pool.query("DELETE FROM rfqs WHERE rfq_no = 'RFQ-TEST-COST-001'");
    await pool.query("DELETE FROM customers WHERE name = 'Costing Save Test Customer'");
    await pool.query("DELETE FROM users WHERE email = 'costing_test_estimator@companya.in'");
  });

  it("throws ForbiddenError when sales head attempts to save costing", async () => {
    mockState.role = "sales_head";
    await expect(
      saveCosting({
        quoteId,
        expectedVersion: initialVersion,
        parts: {
          partId,
          ops: [{ seq: 1, opName: "Turning", machineCode: "M-850", cycleMin: "3.2", setupMin: "45" }],
          tiers: [{ tierNo: 1, volume: 180000, lotSize: "15000", marginPct: "0.12" }],
        },
      })
    ).rejects.toThrow(/not authorized/);
  });

  it("succeeds when estimator saves with current version and increments version", async () => {
    mockState.role = "estimator";
    const result = await saveCosting({
      quoteId,
      expectedVersion: initialVersion,
      parts: {
        partId,
        ops: [{ seq: 1, opName: "Turning", machineCode: "M-850", cycleMin: "3.2", setupMin: "45" }],
        tiers: [{ tierNo: 1, volume: 180000, lotSize: "15000", marginPct: "0.12" }],
      },
    });

    expect(result.version).toBe(initialVersion + 1);

    // Verify in database
    const qRow = await pool.query("SELECT version FROM quotes WHERE id = $1", [quoteId]);
    expect(qRow.rows[0].version).toBe(initialVersion + 1);

    const tierRows = await pool.query(
      "SELECT volume, lot_size, margin_pct FROM quote_part_tiers WHERE quote_id = $1 AND part_id = $2",
      [quoteId, partId]
    );
    expect(tierRows.rows.length).toBe(1);
    expect(tierRows.rows[0].volume).toBe(180000);
  });

  it("throws ConflictError on stale expectedVersion and leaves tiers unchanged", async () => {
    mockState.role = "estimator";

    // Attempting to save again with the stale initialVersion
    await expect(
      saveCosting({
        quoteId,
        expectedVersion: initialVersion, // Stale!
        parts: {
          partId,
          ops: [],
          tiers: [{ tierNo: 1, volume: 999999, lotSize: "999", marginPct: "0.05" }],
        },
      })
    ).rejects.toThrow(ConflictError);

    // Verify database was untouched
    const tierRows = await pool.query(
      "SELECT volume FROM quote_part_tiers WHERE quote_id = $1 AND part_id = $2",
      [quoteId, partId]
    );
    expect(tierRows.rows[0].volume).toBe(180000); // Unchanged!
  });

  it("rejects saving when part ID does not belong to the quote's RFQ", async () => {
    mockState.role = "estimator";
    const currentVerRes = await pool.query("SELECT version FROM quotes WHERE id = $1", [quoteId]);
    const curVer = currentVerRes.rows[0].version;

    await expect(
      saveCosting({
        quoteId,
        expectedVersion: curVer,
        parts: {
          partId: 999999, // Non-existent or alien part ID
          ops: [{ seq: 1, opName: "Turning", machineCode: "M-850", cycleMin: "3.2", setupMin: "45" }],
          tiers: [{ tierNo: 1, volume: 180000, lotSize: "15000", marginPct: "0.12" }],
        },
      })
    ).rejects.toThrow(/does not belong/);
  });
});
