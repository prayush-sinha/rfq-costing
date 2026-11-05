import { defineConfig } from "vitest/config";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.local and .env for Vitest
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).DB_TARGET = "test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
