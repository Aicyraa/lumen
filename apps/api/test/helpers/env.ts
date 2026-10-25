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
  if (!config.databaseUrl.endsWith(`/${testDbName()}`)) throw new Error("tests must use the test database");
  return config;
}
