import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { Pool } from "pg";
import { seedDatabase } from "../src/db/seed";

const url =
  process.env.DB_TARGET === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

if (!url) {
  console.error("Database connection URL is not set");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: url });
  console.log("Truncating demo data...");
  await pool.query("TRUNCATE TABLE quote_part_tiers CASCADE");
  await pool.query("TRUNCATE TABLE quote_snapshots CASCADE");
  await pool.query("TRUNCATE TABLE quotes CASCADE");
  await pool.query("TRUNCATE TABLE routing_ops CASCADE");
  await pool.query("TRUNCATE TABLE parts CASCADE");
  await pool.query("TRUNCATE TABLE rfqs CASCADE");
  await pool.query("TRUNCATE TABLE customers CASCADE");
  await pool.query("TRUNCATE TABLE rate_materials CASCADE");
  await pool.query("TRUNCATE TABLE rate_machines CASCADE");
  await pool.query("TRUNCATE TABLE rate_params CASCADE");
  await pool.query("TRUNCATE TABLE audit_log CASCADE");
  await pool.query("TRUNCATE TABLE login_attempts CASCADE");
  await pool.query("TRUNCATE TABLE past_quotes CASCADE");
  await pool.query("TRUNCATE TABLE users CASCADE");

  console.log("Re-seeding database...");
  await seedDatabase(pool);
  await pool.end();
  console.log("✓ Reset and seed complete.");
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
