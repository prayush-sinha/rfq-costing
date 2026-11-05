import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { Pool } from "pg";
import { parseRow } from "../src/lib/import/parse-rows";

async function main() {
  const connectionString =
    process.env.DB_TARGET === "test"
      ? process.env.TEST_DATABASE_URL
      : process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set in environment");
  }

  const pool = new Pool({
    connectionString,
    max: 5,
  });
  const csvPath = path.resolve(process.cwd(), "data/past-quotes.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}. Run npm run gen:past-quotes first.`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  console.log(`Parsing past quotes CSV (${(csvContent.length / 1024).toFixed(1)} KB)...`);

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const validRows = [];
  const errors = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const res = parseRow(raw);
    if (res.ok) {
      validRows.push(res.row);
    } else {
      errors.push({ row: i + 2, reason: res.reason });
    }
  }

  console.log(`Parsed ${parsed.data.length} rows: ${validRows.length} valid, ${errors.length} invalid.`);

  if (errors.length > 0) {
    console.warn(`Sample validation errors:`, errors.slice(0, 5));
  }

  console.log(`Importing ${validRows.length} rows into 'past_quotes' table in batches...`);
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);

    // Build multi-row parameterized query
    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const r of batch) {
      valuePlaceholders.push(
        `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
      );
      values.push(
        r.quoteNo,
        r.quoteDate,
        r.customer,
        r.partName,
        r.material,
        r.grossWtKg,
        r.annualVolume,
        r.cycleTimeMin || null,
        r.unitPrice || null,
        r.outcome
      );
    }

    const query = `
      INSERT INTO past_quotes (
        quote_no, quote_date, customer, part_name, material,
        gross_wt_kg, annual_volume, cycle_time_min, unit_price, outcome
      )
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (quote_no, part_name) DO UPDATE SET
        quote_date = EXCLUDED.quote_date,
        customer = EXCLUDED.customer,
        material = EXCLUDED.material,
        gross_wt_kg = EXCLUDED.gross_wt_kg,
        annual_volume = EXCLUDED.annual_volume,
        cycle_time_min = EXCLUDED.cycle_time_min,
        unit_price = EXCLUDED.unit_price,
        outcome = EXCLUDED.outcome
    `;

    await pool.query(query, values);
    inserted += batch.length;
    process.stdout.write(`\rImported ${inserted} / ${validRows.length} rows...`);
  }

  console.log("\nImport completed successfully!");
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
