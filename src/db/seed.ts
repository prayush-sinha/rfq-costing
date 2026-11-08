import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

export async function seedDatabase(pool: Pool) {
  // 1. Seed Users (Rule 15: demo password comes strictly from DEMO_PASSWORD env var)
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) {
    throw new Error(
      "DEMO_PASSWORD environment variable is required for database seeding (CLAUDE.md Rule 15)"
    );
  }
  const hash = await bcrypt.hash(demoPassword, 10);

  const users = [
    { email: "estimator@companya.in", role: "estimator" },
    { email: "saleshead@companya.in", role: "sales_head" },
  ];

  const userIds: Record<string, number> = {};
  for (const u of users) {
    const res = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
       RETURNING id`,
      [u.email, hash, u.role]
    );
    userIds[u.role] = res.rows[0].id;
  }

  // 2. Seed Customers (Strictly aligned with client brief)
  const customerNames = [
    "Company B (two-wheelers)",
    "Company C (tractors)",
    "Company D (drivetrains)",
  ];

  const customerIds: Record<string, number> = {};
  for (const name of customerNames) {
    const res = await pool.query(
      `INSERT INTO customers (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name]
    );
    customerIds[name] = res.rows[0].id;
  }

  // 3. Seed Rate Materials (Append-only, with two effective dates for EN8)
  const materials = [
    { grade: "EN8", rate: "68.0000", scrap: "24.0000", date: "2026-01-01" },
    { grade: "EN8", rate: "72.0000", scrap: "25.0000", date: "2026-07-01" },
    { grade: "40Cr4", rate: "78.0000", scrap: "30.0000", date: "2026-01-01" },
    { grade: "20MnCr5", rate: "82.0000", scrap: "28.0000", date: "2026-01-01" },
    { grade: "SS304", rate: "195.0000", scrap: "45.0000", date: "2026-01-01" },
    { grade: "LM24", rate: "165.0000", scrap: "55.0000", date: "2026-01-01" },
  ];

  for (const m of materials) {
    await pool.query(
      `INSERT INTO rate_materials (grade, rate_per_kg, scrap_rate_per_kg, effective_from)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (grade, effective_from) DO NOTHING`,
      [m.grade, m.rate, m.scrap, m.date]
    );
  }

  // 4. Seed Machine Hour Rates
  const machines = [
    { code: "M-850", rate: "850.00", date: "2026-01-01" },
    { code: "VMC-1450", rate: "1450.00", date: "2026-01-01" },
    { code: "CNC-950", rate: "950.00", date: "2026-01-01" },
  ];

  for (const mc of machines) {
    await pool.query(
      `INSERT INTO rate_machines (machine_code, hour_rate, effective_from)
       VALUES ($1, $2, $3)
       ON CONFLICT (machine_code, effective_from) DO NOTHING`,
      [mc.code, mc.rate, mc.date]
    );
  }

  // 5. Seed Commercial Parameters (with two effective dates for overhead_pct)
  const params = [
    { key: "overhead_pct", value: "0.120000", date: "2026-01-01" },
    { key: "overhead_pct", value: "0.130000", date: "2026-08-01" },
    { key: "packing_per_unit", value: "1.200000", date: "2026-01-01" },
    { key: "freight_per_kg", value: "2.500000", date: "2026-01-01" },
    { key: "gst_pct", value: "0.180000", date: "2026-01-01" },
    { key: "default_margin_pct", value: "0.120000", date: "2026-01-01" },
  ];

  for (const p of params) {
    await pool.query(
      `INSERT INTO rate_params (key, value, effective_from)
       VALUES ($1, $2, $3)
       ON CONFLICT (key, effective_from) DO NOTHING`,
      [p.key, p.value, p.date]
    );
  }

  // 6. Seed RFQs with Parts, Routings, Quotes & Tiers
  // RFQ 1: RFQ-2611-014 (Spindle, Estimating)
  const rfq1Res = await pool.query(
    `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rfq_no) DO UPDATE SET due_date = EXCLUDED.due_date
     RETURNING id`,
    ["RFQ-2611-014", customerIds["Company B (two-wheelers)"], "2026-11-20", userIds["estimator"], "estimating"]
  );
  const rfq1Id = rfq1Res.rows[0].id;

  const part1Res = await pool.query(
    `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years, drawing_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [rfq1Id, "Rear wheel spindle", "EN8", "0.610", "0.0800", 180000, "0", "2.0", "DWG-SPINDLE-REV2"]
  );
  const part1Id = part1Res.rows[0]?.id;
  if (part1Id) {
    await pool.query(
      `INSERT INTO routing_ops (part_id, seq, op_name, machine_code, cycle_min, setup_min)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (part_id, seq) DO NOTHING`,
      [part1Id, 1, "Turning & Facing", "M-850", "3.200", "45.00"]
    );

    const q1Res = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [rfq1Id, "draft", 1, "2026-11-04"]
    );
    const q1Id = q1Res.rows[0]?.id;
    if (q1Id) {
      await pool.query(
        `INSERT INTO quote_part_tiers (quote_id, part_id, tier_no, volume, lot_size, margin_pct)
         VALUES ($1, $2, 1, 90000, 7500, '0.1200'),
                ($1, $2, 2, 180000, 15000, '0.1200'),
                ($1, $2, 3, 360000, 30000, '0.1200')
         ON CONFLICT (quote_id, part_id, tier_no) DO NOTHING`,
        [q1Id, part1Id]
      );
    }
  }

  // RFQ 2: RFQ-2611-019 (Lift Arm, Sent, Quote Pending Approval > Rs 25 Lakh)
  const rfq2Res = await pool.query(
    `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rfq_no) DO UPDATE SET due_date = EXCLUDED.due_date
     RETURNING id`,
    ["RFQ-2611-019", customerIds["Company C (tractors)"], "2026-11-25", userIds["estimator"], "sent"]
  );
  const rfq2Id = rfq2Res.rows[0].id;

  const part2Res = await pool.query(
    `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years, drawing_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [rfq2Id, "Hydraulic lift arm", "40Cr4", "4.600", "0.0500", 24000, "800000.00", "2.0", "DWG-LIFTARM-FORGING-01"]
  );
  const part2Id = part2Res.rows[0]?.id;
  if (part2Id) {
    await pool.query(
      `INSERT INTO routing_ops (part_id, seq, op_name, machine_code, cycle_min, setup_min)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (part_id, seq) DO NOTHING`,
      [part2Id, 1, "VMC Machining & Profiling", "VMC-1450", "11.500", "120.00"]
    );

    const q2Res = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date, submitted_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [rfq2Id, "pending_approval", 1, "2026-11-04"]
    );
    const q2Id = q2Res.rows[0]?.id;
    if (q2Id) {
      await pool.query(
        `INSERT INTO quote_part_tiers (quote_id, part_id, tier_no, volume, lot_size, margin_pct)
         VALUES ($1, $2, 1, 12000, 1000, '0.1200'),
                ($1, $2, 2, 24000, 2000, '0.1000'),
                ($1, $2, 3, 48000, 4000, '0.0800')
         ON CONFLICT (quote_id, part_id, tier_no) DO NOTHING`,
        [q2Id, part2Id]
      );
    }
  }

  // RFQ 3: RFQ-2611-023 (Gear Blank, Won, Approved Quote)
  const rfq3Res = await pool.query(
    `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (rfq_no) DO UPDATE SET due_date = EXCLUDED.due_date
     RETURNING id`,
    ["RFQ-2611-023", customerIds["Company D (drivetrains)"], "2026-11-28", userIds["estimator"], "won"]
  );
  const rfq3Id = rfq3Res.rows[0].id;

  const part3Res = await pool.query(
    `INSERT INTO parts (rfq_id, name, material, gross_wt_kg, scrap_pct, annual_volume, tooling_cost, tooling_years, drawing_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [rfq3Id, "Gear blank", "20MnCr5", "1.480", "0.0700", 60000, "0", "2.0", "DWG-GEAR-BLANK-5SPD"]
  );
  const part3Id = part3Res.rows[0]?.id;
  if (part3Id) {
    await pool.query(
      `INSERT INTO routing_ops (part_id, seq, op_name, machine_code, cycle_min, setup_min)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (part_id, seq) DO NOTHING`,
      [part3Id, 1, "CNC Hobbing & Turning", "CNC-950", "4.800", "60.00"]
    );

    const q3Res = await pool.query(
      `INSERT INTO quotes (rfq_id, status, version, as_of_date, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [rfq3Id, "approved", 1, "2026-11-04", userIds["sales_head"]]
    );
    const q3Id = q3Res.rows[0]?.id;
    if (q3Id) {
      await pool.query(
        `INSERT INTO quote_part_tiers (quote_id, part_id, tier_no, volume, lot_size, margin_pct)
         VALUES ($1, $2, 1, 30000, 2500, '0.1200'),
                ($1, $2, 2, 60000, 5000, '0.1200'),
                ($1, $2, 3, 120000, 10000, '0.1200')
         ON CONFLICT (quote_id, part_id, tier_no) DO NOTHING`,
        [q3Id, part3Id]
      );
    }
  }

  // RFQ 4: RFQ-2611-008 (Lost, with required lost_reason)
  await pool.query(
    `INSERT INTO rfqs (rfq_no, customer_id, due_date, owner_id, status, lost_reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (rfq_no) DO UPDATE SET lost_reason = EXCLUDED.lost_reason`,
    [
      "RFQ-2611-008",
      customerIds["Company B (two-wheelers)"],
      "2026-10-15",
      userIds["estimator"],
      "lost",
      "Competitor quoted 6% lower with local forgings",
    ]
  );

  // 7. Seed Past Quotes from data/past-quotes.csv (if file exists)
  const csvPath = path.resolve(__dirname, "../../data/past-quotes.csv");
  if (fs.existsSync(csvPath)) {
    const rawContent = fs.readFileSync(csvPath, "utf-8");
    const rows = rawContent.split("\n").slice(1).filter((l) => l.trim().length > 0);

    const validRows: any[] = [];
    for (const line of rows.slice(0, 300)) {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (parts.length >= 10) {
        const quoteNo = parts[0].trim();
        const quoteDate = parts[1].trim();
        const customer = parts[2].trim();
        const partName = parts[3].replace(/^"|"$/g, "").trim();
        const material = parts[4].trim();
        const grossWtKg = Number(parts[5].trim());
        const annualVolume = Number(parts[6].trim());
        const cycleTimeMin = Number(parts[7].trim());
        const unitPrice = Number(parts[8].trim());
        const outcome = parts[9].trim();

        if (
          material &&
          grossWtKg > 0 &&
          annualVolume > 0 &&
          ["won", "lost", "open"].includes(outcome)
        ) {
          validRows.push({
            quoteNo,
            quoteDate,
            customer,
            partName,
            material,
            grossWtKg,
            annualVolume,
            cycleTimeMin,
            unitPrice,
            outcome,
          });
        }
      }
    }

    // Batch insert in chunks of 50 to minimize cross-region latency
    const chunkSize = 50;
    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      const valuesSql: string[] = [];
      const params: any[] = [];
      chunk.forEach((r, idx) => {
        const base = idx * 10;
        valuesSql.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
        );
        params.push(
          r.quoteNo,
          r.quoteDate,
          r.customer,
          r.partName,
          r.material,
          r.grossWtKg,
          r.annualVolume,
          r.cycleTimeMin,
          r.unitPrice,
          r.outcome
        );
      });
      await pool.query(
        `INSERT INTO past_quotes (quote_no, quote_date, customer, part_name, material, gross_wt_kg, annual_volume, cycle_time_min, unit_price, outcome)
         VALUES ${valuesSql.join(", ")}
         ON CONFLICT (quote_no, part_name) DO NOTHING`,
        params
      );
    }
  }

  console.log("✓ Database seeding complete.");
}

async function runCli() {
  const url =
    process.env.DB_TARGET === "test"
      ? process.env.TEST_DATABASE_URL
      : process.env.DATABASE_URL;

  if (!url) {
    console.error("Database connection URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    await seedDatabase(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
