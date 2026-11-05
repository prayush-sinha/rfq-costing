import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "./test-pool";
import { seedDatabase } from "./seed";

describe("Rate tables append-only triggers and case-insensitive uniqueness (Decision D3 & D4)", () => {
  beforeAll(async () => {
    // Truncate and seed test database
    await pool.query("TRUNCATE TABLE rate_materials, rate_machines, rate_params CASCADE");
    await seedDatabase(pool);
  });

  afterAll(async () => {
    await pool.query("TRUNCATE TABLE rate_materials, rate_machines, rate_params CASCADE");
    await seedDatabase(pool);
  });

  it("forbids UPDATE on rate_materials via trigger", async () => {
    const res = await pool.query(
      "INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from) VALUES ('TEST_MAT', 100, 30, '2026-12-01') RETURNING id"
    );
    const id = res.rows[0].id;

    await expect(
      pool.query("UPDATE rate_materials SET rate_per_kg = 110 WHERE id = $1", [id])
    ).rejects.toThrow(/rate_materials rows are append-only/i);
  });

  it("forbids DELETE on rate_materials via trigger", async () => {
    const res = await pool.query(
      "INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from) VALUES ('TEST_MAT_DEL', 100, 30, '2026-12-01') RETURNING id"
    );
    const id = res.rows[0].id;

    await expect(
      pool.query("DELETE FROM rate_materials WHERE id = $1", [id])
    ).rejects.toThrow(/rate_materials rows are append-only/i);
  });

  it("forbids UPDATE on rate_machines via trigger", async () => {
    const res = await pool.query(
      "INSERT INTO rate_machines (machine_code, hour_rate, effective_from) VALUES ('TEST_MAC', 500, '2026-12-01') RETURNING id"
    );
    const id = res.rows[0].id;

    await expect(
      pool.query("UPDATE rate_machines SET hour_rate = 600 WHERE id = $1", [id])
    ).rejects.toThrow(/rate_machines rows are append-only/i);
  });

  it("forbids DELETE on rate_machines via trigger", async () => {
    const res = await pool.query(
      "INSERT INTO rate_machines (machine_code, hour_rate, effective_from) VALUES ('TEST_MAC_DEL', 500, '2026-12-01') RETURNING id"
    );
    const id = res.rows[0].id;

    await expect(
      pool.query("DELETE FROM rate_machines WHERE id = $1", [id])
    ).rejects.toThrow(/rate_machines rows are append-only/i);
  });

  it("forbids UPDATE on rate_params via trigger", async () => {
    const res = await pool.query(
      "INSERT INTO rate_params (key, value, effective_from) VALUES ('overhead_pct', '0.150000', '2026-12-01') RETURNING id"
    );
    const id = res.rows[0].id;

    await expect(
      pool.query("UPDATE rate_params SET value = '0.200000' WHERE id = $1", [id])
    ).rejects.toThrow(/rate_params rows are append-only/i);
  });

  it("forbids DELETE on rate_params via trigger", async () => {
    const res = await pool.query(
      "INSERT INTO rate_params (key, value, effective_from) VALUES ('overhead_pct', '0.160000', '2026-12-02') RETURNING id"
    );
    const id = res.rows[0].id;

    await expect(
      pool.query("DELETE FROM rate_params WHERE id = $1", [id])
    ).rejects.toThrow(/rate_params rows are append-only/i);
  });

  it("rejects case-insensitive duplicate material grade on the same date", async () => {
    await pool.query(
      "INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from) VALUES ('EN8_CASE', 70, 20, '2026-12-10')"
    );

    await expect(
      pool.query(
        "INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from) VALUES ('en8_case', 72, 22, '2026-12-10')"
      )
    ).rejects.toThrow(/unique/i);
  });

  it("rejects case-insensitive duplicate machine code on the same date", async () => {
    await pool.query(
      "INSERT INTO rate_machines (machine_code, hour_rate, effective_from) VALUES ('CNC_CASE', 800, '2026-12-10')"
    );

    await expect(
      pool.query(
        "INSERT INTO rate_machines (machine_code, hour_rate, effective_from) VALUES ('cnc_case', 850, '2026-12-10')"
      )
    ).rejects.toThrow(/unique/i);
  });

  it("permits TRUNCATE to reset tables cleanly without firing row triggers", async () => {
    await expect(
      pool.query("TRUNCATE TABLE rate_materials, rate_machines, rate_params CASCADE")
    ).resolves.toBeDefined();
  });
});
