import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const isTest =
  process.env.VITEST === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.DB_TARGET === "test";

const connectionString =
  isTest && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  max: 5,
});

export const db = drizzle(pool, { schema });
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const withTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
