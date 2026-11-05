import { Pool } from "pg";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
if (url === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: the schema tests truncate tables");
}

export const pool = new Pool({ connectionString: url, max: 2 });
