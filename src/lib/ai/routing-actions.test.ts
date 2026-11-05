import { describe, it, expect, vi, beforeAll } from "vitest";
import { pool } from "@/db/test-pool";
import { getRoutingSuggestions, logRoutingSuggestionApplied } from "./routing-actions";

const mockUser = {
  id: 1,
  email: "estimator@companya.in",
  role: "estimator" as const,
};

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => mockUser),
  requireRole: vi.fn(async () => mockUser),
}));

describe("Routing Suggestions Integration", () => {
  let targetPartId: number;

  beforeAll(async () => {
    // 1. Ensure user
    const uRes = await pool.query(
      `INSERT INTO users (email, role, password_hash)
       VALUES ('estimator@companya.in', 'estimator', 'hash')
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`
    );
    mockUser.id = uRes.rows[0].id;

    // 2. Ensure customer
    const cRes = await pool.query(
      `INSERT INTO customers (name)
       VALUES ('Routing Test Auto')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const custId = cRes.rows[0].id;

    // 3. Ensure RFQ
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, owner_id, due_date, status)
       VALUES ('RFQ-ROUTING-01', $1, $2, '2026-11-25', 'estimating')
       ON CONFLICT (rfq_no) DO UPDATE SET due_date = '2026-11-25'
       RETURNING id`,
      [custId, mockUser.id]
    );
    const rfqId = rfqRes.rows[0].id;

    // 4. Ensure target part (0.600 kg, EN8)
    const pRes = await pool.query(
      `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years)
       VALUES ($1, 'Pinion Gear Target', 'EN8', 0.600, 0.0800, 15000, 0, 2.0)
       RETURNING id`,
      [rfqId]
    );
    targetPartId = pRes.rows[0].id;

    // 5. Insert past quotes for matching
    await pool.query(
      `INSERT INTO past_quotes (quote_no, quote_date, customer, part_name, material, gross_wt_kg, annual_volume, cycle_time_min, unit_price, outcome)
       VALUES ('PQ-MATCH-01', '2026-01-10', 'Tata Motors', 'Pinion Gear Past', 'EN8', 0.620, 20000, 3.500, 85.00, 'won')
       ON CONFLICT (quote_no, part_name) DO UPDATE SET cycle_time_min = 3.500`
    );
  });

  it("suggests matching past parts based on material, weight, and name similarity", async () => {
    const res = await getRoutingSuggestions(targetPartId);
    expect(res.targetPart.name).toBe("Pinion Gear Target");
    expect(res.suggestions.length).toBeGreaterThan(0);

    const first = res.suggestions[0];
    expect(first.source.material.toLowerCase()).toBe("en8");
    expect(first.source.ops.length).toBeGreaterThan(0);
    expect(first.score).toBeGreaterThan(0);
  });

  it("logs audit entry when suggestion is applied", async () => {
    const res = await logRoutingSuggestionApplied(targetPartId, "PQ-MATCH-01");
    expect(res.success).toBe(true);

    const logRes = await pool.query(
      `SELECT * FROM audit_log WHERE entity = 'part' AND entity_id = $1 AND action = 'apply_routing_suggestion' ORDER BY id DESC LIMIT 1`,
      [String(targetPartId)]
    );
    expect(logRes.rows.length).toBe(1);
    expect(logRes.rows[0].detail.sourceQuoteNo).toBe("PQ-MATCH-01");
  });
});
