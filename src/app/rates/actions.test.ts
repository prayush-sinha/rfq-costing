import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { pool } from "@/db/test-pool";
import { seedDatabase } from "@/db/seed";

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
    requireRole: vi.fn(async (expectedRole: string) => {
      if (mockState.role !== expectedRole) {
        throw new ForbiddenError(`Role '${mockState.role}' is not authorized for this action`);
      }
      return { id: mockState.userId, email: "saleshead@companya.in", role: mockState.role };
    }),
  };
});

import { addRate } from "./actions";

describe("addRate server action", () => {
  beforeAll(async () => {
    // Ensure saleshead user exists for audit log foreign key
    const userRes = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ('saleshead@companya.in', 'dummy', 'sales_head')
      ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
      RETURNING id;
    `);
    mockState.userId = userRes.rows[0].id;

    // Reset rate tables using TRUNCATE (append-only trigger blocks DELETE)
    await pool.query("TRUNCATE TABLE rate_materials, rate_machines, rate_params CASCADE");
    await seedDatabase(pool);
  });

  afterAll(async () => {
    // Restore base seed state
    await pool.query("TRUNCATE TABLE rate_materials, rate_machines, rate_params CASCADE");
    await seedDatabase(pool);
  });

  it("throws ForbiddenError when called by an estimator", async () => {
    mockState.role = "estimator";
    await expect(
      addRate("material", {
        grade: "ACTION_TEST_EN8",
        ratePerKg: "75",
        scrapRatePerKg: "25",
        effectiveFrom: "2099-01-01",
      })
    ).rejects.toThrow(/not authorized/);
  });

  it("rejects backdated rates where effectiveFrom < today", async () => {
    mockState.role = "sales_head";
    const res = await addRate(
      "material",
      {
        grade: "ACTION_TEST_EN8",
        ratePerKg: "75",
        scrapRatePerKg: "25",
        effectiveFrom: "2025-01-01",
      },
      { now: "2026-11-06" }
    );
    expect(res).toEqual({
      error: "backdated",
      message: "Rates cannot be backdated. Effective date (2025-01-01) must be >= 2026-11-06",
    });
  });

  it("inserts a valid future rate and writes an audit log row", async () => {
    mockState.role = "sales_head";
    const res = await addRate(
      "material",
      {
        grade: "ACTION_TEST_EN8",
        ratePerKg: "75.5000",
        scrapRatePerKg: "25.0000",
        effectiveFrom: "2099-06-01",
      },
      { now: "2026-11-06" }
    );

    expect(res).toMatchObject({ success: true });
    if ("id" in res) {
      // Verify row in rate_materials
      const matRow = await pool.query(
        "SELECT * FROM rate_materials WHERE id = $1",
        [res.id]
      );
      expect(matRow.rows.length).toBe(1);
      expect(matRow.rows[0].grade).toBe("ACTION_TEST_EN8");

      // Verify audit log row
      const auditRow = await pool.query(
        "SELECT * FROM audit_log WHERE entity = 'rate_material' AND entity_id = $1",
        [String(res.id)]
      );
      expect(auditRow.rows.length).toBe(1);
      expect(auditRow.rows[0].action).toBe("create");
    }
  });

  it("returns 409 conflict when duplicate rate is added on same date", async () => {
    mockState.role = "sales_head";
    const res = await addRate(
      "material",
      {
        grade: "ACTION_TEST_EN8",
        ratePerKg: "78.0000",
        scrapRatePerKg: "26.0000",
        effectiveFrom: "2099-06-01",
      },
      { now: "2026-11-06" }
    );

    expect(res).toEqual({
      error: "conflict",
      status: 409,
      message: "A rate already exists for this item on the specified effective date.",
    });
  });

  it("normalizes grade to uppercase and enforces case-insensitive conflict", async () => {
    mockState.role = "sales_head";
    // Adding lowercase 'action_test_en8' on same date '2099-06-01'
    const res = await addRate(
      "material",
      {
        grade: "action_test_en8",
        ratePerKg: "80.0000",
        scrapRatePerKg: "27.0000",
        effectiveFrom: "2099-06-01",
      },
      { now: "2026-11-06" }
    );

    expect(res).toEqual({
      error: "conflict",
      status: 409,
      message: "A rate already exists for this item on the specified effective date.",
    });
  });
});
