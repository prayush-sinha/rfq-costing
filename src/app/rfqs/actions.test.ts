import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { pool } from "@/db/test-pool";

const { mockState } = vi.hoisted(() => ({
  mockState: { role: "sales_head" as "estimator" | "sales_head", userId: 1 },
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
    requireUser: vi.fn(async () => ({
      id: mockState.userId,
      email: "estimator@companya.in",
      role: mockState.role,
    })),
    requireRole: vi.fn(async (expectedRole: string) => {
      if (mockState.role !== expectedRole) {
        throw new ForbiddenError(`Role '${mockState.role}' is not authorized for this action`);
      }
      return { id: mockState.userId, email: "saleshead@companya.in", role: mockState.role };
    }),
  };
});

import { markWonLost, createRfq } from "./actions";

describe("rfq actions", () => {
  let testRfqId: number;

  beforeAll(async () => {
    // Ensure test user and customer exist
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('action_user@companya.in', 'dummy', 'sales_head')
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id;
    `);
    mockState.userId = userRes.rows[0].id;

    const custRes = await pool.query(`
      INSERT INTO customers (name)
      VALUES ('RFQ Action Test Customer')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const custId = custRes.rows[0].id;

    // Create a dedicated test RFQ
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
       VALUES ('RFQ-TEST-ACTION-001', $1, '2026-12-01', $2, 'estimating')
       ON CONFLICT (rfq_no) DO UPDATE SET status = 'estimating', lost_reason = NULL
       RETURNING id`,
      [custId, mockState.userId]
    );
    testRfqId = rfqRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM audit_log WHERE entity = 'rfq' AND entity_id = $1", [
      String(testRfqId),
    ]);
    await pool.query("DELETE FROM rfqs WHERE id = $1", [testRfqId]);
    await pool.query("DELETE FROM customers WHERE name = 'RFQ Action Test Customer'");
    await pool.query("DELETE FROM users WHERE email = 'action_user@companya.in'");
  });

  it("rejects marking RFQ as lost without a reason", async () => {
    mockState.role = "sales_head";
    const res = await markWonLost(testRfqId, "lost", "");
    expect(res).toEqual({
      error: "validation",
      message: "A lost reason is mandatory when marking an RFQ as lost.",
    });
  });

  it("throws when estimator attempts to mark RFQ won/lost", async () => {
    mockState.role = "estimator";
    await expect(
      markWonLost(testRfqId, "lost", "Competitor price lower")
    ).rejects.toThrow(/not authorized/);
  });

  it("succeeds when sales head marks RFQ lost with a valid reason", async () => {
    mockState.role = "sales_head";
    const reason = "Competitor quoted 8% lower on imported forging";
    const res = await markWonLost(testRfqId, "lost", reason);
    expect(res).toEqual({ success: true });

    // Verify in database
    const rfqRow = await pool.query("SELECT status, lost_reason FROM rfqs WHERE id = $1", [
      testRfqId,
    ]);
    expect(rfqRow.rows[0].status).toBe("lost");
    expect(rfqRow.rows[0].lost_reason).toBe(reason);

    // Verify audit log
    const audit = await pool.query(
      "SELECT action, entity, entity_id FROM audit_log WHERE entity = 'rfq' AND entity_id = $1 AND action = 'mark_lost'",
      [String(testRfqId)]
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("succeeds when sales head marks RFQ won", async () => {
    mockState.role = "sales_head";
    const res = await markWonLost(testRfqId, "won");
    expect(res).toEqual({ success: true });

    const rfqRow = await pool.query("SELECT status, lost_reason FROM rfqs WHERE id = $1", [
      testRfqId,
    ]);
    expect(rfqRow.rows[0].status).toBe("won");
  });
});
