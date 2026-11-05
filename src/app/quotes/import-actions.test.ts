import { describe, it, expect, vi, beforeAll } from "vitest";
import { pool } from "@/db/test-pool";
import { importPastQuoteRows, queryPastQuotes } from "./import-actions";

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

describe("Past Quotes Importer & Search Integration", () => {
  beforeAll(async () => {
    // Ensure test user exists
    const res = await pool.query(
      `INSERT INTO users (email, role, password_hash)
       VALUES ('estimator@companya.in', 'estimator', 'hash')
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`
    );
    mockUser.id = res.rows[0].id;
  });

  it("validates and imports past quote rows in batches", async () => {
    const rawBatch = [
      {
        quote_no: "PQ-TEST-0001",
        quote_date: "2026-02-15",
        customer: "Mahindra & Mahindra",
        part_name: "Connecting Rod Bolt",
        material: "EN8D",
        gross_wt_kg: "0.450",
        annual_volume: "35000",
        cycle_time_min: "2.80",
        unit_price: "112.50",
        outcome: "won",
      },
      {
        quote_no: "PQ-TEST-0002",
        quote_date: "invalid-date",
        customer: "Tata Motors",
        part_name: "Bad Date Part",
        material: "EN8",
        gross_wt_kg: "1.000",
        annual_volume: "10000",
        outcome: "open",
      },
    ];

    const res = await importPastQuoteRows(rawBatch as Record<string, string>[]);
    expect(res.total).toBe(2);
    expect(res.imported).toBe(1);
    expect(res.errorCount).toBe(1);
    expect(res.errors[0].row).toBe(2);
    expect(res.errors[0].reason).toContain("date must be YYYY-MM-DD");

    // Check DB record
    const dbRow = await pool.query(
      `SELECT * FROM past_quotes WHERE quote_no = 'PQ-TEST-0001' AND part_name = 'Connecting Rod Bolt'`
    );
    expect(dbRow.rows.length).toBe(1);
    expect(dbRow.rows[0].customer).toBe("Mahindra & Mahindra");
  });

  it("queries past quotes with filters and pagination", async () => {
    const res = await queryPastQuotes({
      query: "Connecting Rod",
      pageSize: 10,
    });

    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows[0].partName).toContain("Connecting Rod");
  });
});
