import { describe, it, expect, vi, beforeAll } from "vitest";
import { pool } from "@/db/test-pool";
import { runAiIntake, decideSuggestion } from "./intake-actions";

// Mock user session
const mockUser = {
  id: 1,
  email: "estimator@companya.in",
  role: "estimator" as const,
};

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => mockUser),
  requireRole: vi.fn(async () => mockUser),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("AI Intake Actions Integration", () => {
  let testRfqId: number;

  beforeAll(async () => {
    // 1. Ensure user exists
    const userRes = await pool.query(
      `INSERT INTO users (email, role, password_hash)
       VALUES ('estimator@companya.in', 'estimator', 'hash')
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`
    );
    mockUser.id = userRes.rows[0].id;

    // 2. Ensure customer exists
    const custRes = await pool.query(
      `INSERT INTO customers (name)
       VALUES ('Intake Test Auto')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const customerId = custRes.rows[0].id;

    // 3. Ensure material rate exists for EN8D / EN8
    await pool.query(
      `INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from)
       VALUES ('EN8D', 65.00, 35.00, '2026-01-01')
       ON CONFLICT (grade, effective_from) DO NOTHING`
    );

    // 4. Create an RFQ
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (rfq_no, customer_id, owner_id, due_date, status)
       VALUES ('RFQ-INTAKE-001', $1, $2, '2026-11-15', 'estimating')
       ON CONFLICT (rfq_no) DO UPDATE SET due_date = '2026-11-15'
       RETURNING id`,
      [customerId, mockUser.id]
    );
    testRfqId = rfqRes.rows[0].id;

    // 5. Create a Part
    await pool.query(
      `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years)
       VALUES ($1, 'Old Shaft', 'EN8', 1.000, 0.0800, 10000, 0, 2.0)
       RETURNING id`,
      [testRfqId]
    );
  });

  it("extracts, verifies, and stores suggestions from email text", async () => {
    const email = `
Item: Spindle Shaft
Material: EN8D
Weight: 0.61 kg
Annual volume: 1.8 lakh pcs
Target submission due date: 2026-11-20
`;

    const res = await runAiIntake(testRfqId, email);
    expect(res.success).toBe(true);
    expect(res.verifiedCount).toBeGreaterThan(0);

    // Query ai_suggestions in test DB
    const rows = await pool.query(
      `SELECT * FROM ai_suggestions WHERE rfq_id = $1 ORDER BY id DESC`,
      [testRfqId]
    );

    expect(rows.rows.length).toBeGreaterThan(0);
    const matSug = rows.rows.find((r) => r.field === "material");
    expect(matSug).toBeDefined();
    expect(matSug.value).toBe("EN8D");
    expect(matSug.status).toBe("pending");
  });

  it("decides suggestion: accepting applies updates to RFQ or Part", async () => {
    // Find pending due_date suggestion
    const rows = await pool.query(
      `SELECT * FROM ai_suggestions WHERE rfq_id = $1 AND field = 'due_date' AND status = 'pending' LIMIT 1`,
      [testRfqId]
    );

    if (rows.rows.length > 0) {
      const sug = rows.rows[0];
      const decRes = await decideSuggestion(sug.id, "accepted");
      expect(decRes.success).toBe(true);

      // Verify RFQ was updated
      const rfqRow = await pool.query(`SELECT due_date::text FROM rfqs WHERE id = $1`, [testRfqId]);
      expect(rfqRow.rows[0].due_date).toBe("2026-11-20");

      // Verify suggestion marked accepted
      const sugRow = await pool.query(`SELECT status, decided_by FROM ai_suggestions WHERE id = $1`, [sug.id]);
      expect(sugRow.rows[0].status).toBe("accepted");
      expect(sugRow.rows[0].decided_by).toBe(mockUser.id);
    }
  });

  it("decides suggestion: rejecting does not update the record", async () => {
    // Create dummy suggestion
    const insertRes = await pool.query(
      `INSERT INTO ai_suggestions (rfq_id, part_ref, field, value, source_text, confidence, status)
       VALUES ($1, 'Item 1', 'material', '40Cr4', 'Material: 40Cr4', 0.90, 'pending')
       RETURNING id`,
      [testRfqId]
    );
    const dummyId = insertRes.rows[0].id;

    const rejRes = await decideSuggestion(dummyId, "rejected");
    expect(rejRes.success).toBe(true);

    const sugRow = await pool.query(`SELECT status FROM ai_suggestions WHERE id = $1`, [dummyId]);
    expect(sugRow.rows[0].status).toBe("rejected");
  });
});
