import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// DB_TARGET=test points migrations at TEST_DATABASE_URL; default is DATABASE_URL.
const url = process.env.DB_TARGET === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: url ?? "" },
});
