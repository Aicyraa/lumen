import "../../src/config/env.js";
import { loadConfig, type Config } from "../../src/config/config.js";

// Same environment as dev, but the database is always lumen_test and the RAG URL is replaced per test.
export function testConfig(overrides: Partial<Config> = {}) {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/lumen_test";
  const env = { ...process.env, DATABASE_URL: url.toString(), RAG_SERVICE_URL: "http://127.0.0.1:1" };
  const config = loadConfig(env, overrides);
  if (!config.databaseUrl.endsWith("/lumen_test")) throw new Error("tests must use lumen_test");
  return config;
}
