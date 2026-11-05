import { describe, it, expect, beforeAll } from "vitest";
import { pool } from "./test-pool";
import { seedDatabase } from "./seed";

describe("database seed", () => {
  beforeAll(async () => {
    // Clean before running test to ensure clean baseline
    await pool.query("TRUNCATE TABLE quote_part_tiers CASCADE");
    await pool.query("TRUNCATE TABLE quotes CASCADE");
    await pool.query("TRUNCATE TABLE routing_ops CASCADE");
    await pool.query("TRUNCATE TABLE parts CASCADE");
    await pool.query("TRUNCATE TABLE rfqs CASCADE");
    await pool.query("TRUNCATE TABLE customers CASCADE");
    await pool.query("TRUNCATE TABLE rate_materials CASCADE");
    await pool.query("TRUNCATE TABLE rate_machines CASCADE");
    await pool.query("TRUNCATE TABLE rate_params CASCADE");
    await pool.query("TRUNCATE TABLE users CASCADE");
  });

  it("seeds idempotently and populates all required entities", async () => {
    // Run seed first time
    await seedDatabase(pool);

    const rfqCountRes1 = await pool.query("SELECT COUNT(*) FROM rfqs");
    const rfqCount1 = parseInt(rfqCountRes1.rows[0].count, 10);
    expect(rfqCount1).toBeGreaterThanOrEqual(4);

    // Assert 3 sample RFQs exist
    const sampleRfqs = await pool.query(
      "SELECT rfq_no FROM rfqs WHERE rfq_no IN ('RFQ-2611-014', 'RFQ-2611-019', 'RFQ-2611-022') ORDER BY rfq_no"
    );
    expect(sampleRfqs.rows.map((r) => r.rfq_no)).toEqual([
      "RFQ-2611-014",
      "RFQ-2611-019",
      "RFQ-2611-022",
    ]);

    // Assert EN8 has two rate rows
    const en8Rates = await pool.query(
      "SELECT effective_from::text AS eff_date FROM rate_materials WHERE grade = 'EN8' ORDER BY effective_from"
    );
    expect(en8Rates.rows.length).toBe(2);
    expect(en8Rates.rows[0].eff_date).toBe("2026-01-01");
    expect(en8Rates.rows[1].eff_date).toBe("2026-07-01");

    // Assert at least one RFQ per status (estimating, sent, won, lost)
    const statuses = await pool.query("SELECT DISTINCT status FROM rfqs");
    const statusSet = new Set(statuses.rows.map((r) => r.status));
    expect(statusSet.has("estimating")).toBe(true);
    expect(statusSet.has("sent")).toBe(true);
    expect(statusSet.has("won")).toBe(true);
    expect(statusSet.has("lost")).toBe(true);

    // Assert lost RFQ has a non-empty lost_reason
    const lostRfq = await pool.query("SELECT * FROM rfqs WHERE status = 'lost'");
    expect(lostRfq.rows.length).toBeGreaterThanOrEqual(1);
    expect(lostRfq.rows[0].lost_reason).toBeTruthy();

    // Assert exactly one quote in pending_approval
    const pendingQuotes = await pool.query(
      "SELECT * FROM quotes WHERE status = 'pending_approval'"
    );
    expect(pendingQuotes.rows.length).toBe(1);

    // Assert lift arm has tooling cost of 800000
    const liftArm = await pool.query(
      "SELECT * FROM parts WHERE name LIKE '%Lift Arm%'"
    );
    expect(liftArm.rows.length).toBe(1);
    expect(Number(liftArm.rows[0].tooling_cost)).toBe(800000);

    // Run seed a second time to verify idempotency
    await seedDatabase(pool);

    const rfqCountRes2 = await pool.query("SELECT COUNT(*) FROM rfqs");
    const rfqCount2 = parseInt(rfqCountRes2.rows[0].count, 10);
    expect(rfqCount2).toBe(rfqCount1);

    const en8RatesAfter = await pool.query(
      "SELECT COUNT(*) FROM rate_materials WHERE grade = 'EN8'"
    );
    expect(parseInt(en8RatesAfter.rows[0].count, 10)).toBe(2);
  }, 60000);
});
