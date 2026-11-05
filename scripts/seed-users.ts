import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { Pool } from "pg";
import bcrypt from "bcryptjs";

const url =
  process.env.DB_TARGET === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

if (!url) {
  console.error("Database connection URL is not set");
  process.exit(1);
}

const demoPassword = process.env.DEMO_PASSWORD;
if (!demoPassword) {
  console.error("DEMO_PASSWORD environment variable is required for seeding users");
  process.exit(1);
}
const validDemoPassword: string = demoPassword;

async function main() {
  const pool = new Pool({ connectionString: url });
  const hash = await bcrypt.hash(validDemoPassword, 10);

  const users = [
    { email: "estimator@companya.in", role: "estimator" },
    { email: "saleshead@companya.in", role: "sales_head" },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      [u.email, hash, u.role]
    );
    console.log(`✓ Seeded user: ${u.email} (${u.role})`);
  }

  await pool.end();
  console.log("User seeding complete.");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
