import "../../src/shared/config/env.js";
import { type Config, loadConfig } from "../../src/shared/config/config.js";

// Same environment as dev, but the database is lumen_test (or LUMEN_TEST_DB, for a scratch database) and the RAG URL is replaced per test.
export const testDbName = () => process.env.LUMEN_TEST_DB || "lumen_test";
export function testConfig(overrides: Partial<Config> = {}) {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${testDbName()}`;
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    RAG_SERVICE_URL: "http://127.0.0.1:1",
  };
  const config = loadConfig(env, overrides);
  if (!config.databaseUrl.endsWith(`/${testDbName()}`))
    throw new Error("tests must use the test database");
  return config;
}

// A complete, valid environment for loadConfig (tests of config validation and of the tunables).
export const goodEnv = {
  DATABASE_URL: "postgresql://u:pw-SECRET@localhost:5433/x",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DASHBOARD_ORIGIN: "http://localhost:5173",
  INTERNAL_SECRET: "internal-SECRET",
  RAG_SERVICE_URL: "http://localhost:8000",
  MAX_DOCUMENTS_PER_TENANT: "7",
  RATE_LIMIT_PER_MINUTE: "5",
  MAX_REQUESTS_PER_MONTH: "99",
  MAX_PROJECTS_PER_USER: "4",
  MODEL_KEY_ENCRYPTION_SECRET: "ab".repeat(32),
  NODE_ENV: "test",
};
