import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config.js";

const good = {
  DATABASE_URL: "postgresql://u:pw-SECRET@localhost:5433/x",
  BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: "http://localhost:3000", DASHBOARD_ORIGIN: "http://localhost:5173",
  INTERNAL_SECRET: "internal-SECRET", RAG_SERVICE_URL: "http://localhost:8000",
  MAX_DOCUMENTS_PER_TENANT: "7", RATE_LIMIT_PER_MINUTE: "5", MAX_REQUESTS_PER_MONTH: "99",
};

describe("loadConfig", () => {
  it("reads the three limits from the environment", () => {
    const c = loadConfig(good);
    expect([c.maxDocuments, c.ratePerMinute, c.maxRequestsPerMonth]).toEqual([7, 5, 99]);
  });

  it.each(Object.keys(good))("refuses to start when %s is missing, naming it but never printing a value", (name) => {
    const env: Record<string, string | undefined> = { ...good };
    delete env[name];
    expect(() => loadConfig(env)).toThrow(name);
    try { loadConfig(env); } catch (e) { expect((e as Error).message).not.toMatch(/internal-SECRET|pw-SECRET|s{32}/); }
  });

  it.each(["MAX_DOCUMENTS_PER_TENANT", "RATE_LIMIT_PER_MINUTE", "MAX_REQUESTS_PER_MONTH"])("refuses an empty or non-positive %s", (name) => {
    expect(() => loadConfig({ ...good, [name]: "" })).toThrow(name);
    expect(() => loadConfig({ ...good, [name]: "0" })).toThrow(name);
  });

  it("defaults the global LLM cap to 8 per minute and lets GLOBAL_LLM_CAP_PER_MINUTE override it", () => {
    expect(loadConfig(good).globalLlmCapPerMinute).toBe(8);
    expect(loadConfig({ ...good, GLOBAL_LLM_CAP_PER_MINUTE: "20" }).globalLlmCapPerMinute).toBe(20);
  });

  it("lets an environment variable override a config.json tunable", () => {
    expect(loadConfig({ ...good, INGEST_TIMEOUT_MS: "1234" }).ingestTimeoutMs).toBe(1234);
  });
});
