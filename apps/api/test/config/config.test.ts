import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.js";

const good = {
  DATABASE_URL: "postgresql://u:pw-SECRET@localhost:5433/x",
  BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: "http://localhost:3000", DASHBOARD_ORIGIN: "http://localhost:5173",
  INTERNAL_SECRET: "internal-SECRET", RAG_SERVICE_URL: "http://localhost:8000",
  MAX_DOCUMENTS_PER_TENANT: "7", RATE_LIMIT_PER_MINUTE: "5", MAX_REQUESTS_PER_MONTH: "99", MAX_PROJECTS_PER_USER: "4",
  MODEL_KEY_ENCRYPTION_SECRET: "ab".repeat(32),
};

describe("loadConfig", () => {
  it("reads the limits from the environment", () => {
    const c = loadConfig(good);
    expect([c.maxDocuments, c.ratePerMinute, c.maxRequestsPerMonth, c.maxProjectsPerUser]).toEqual([7, 5, 99, 4]);
  });

  it.each(Object.keys(good))("refuses to start when %s is missing, naming it but never printing a value", (name) => {
    const env: Record<string, string | undefined> = { ...good };
    delete env[name];
    expect(() => loadConfig(env)).toThrow(name);
    try { loadConfig(env); } catch (e) { expect((e as Error).message).not.toMatch(/internal-SECRET|pw-SECRET|s{32}/); }
  });

  it.each(["MAX_DOCUMENTS_PER_TENANT", "RATE_LIMIT_PER_MINUTE", "MAX_REQUESTS_PER_MONTH", "MAX_PROJECTS_PER_USER"])("refuses an empty or non-positive %s", (name) => {
    expect(() => loadConfig({ ...good, [name]: "" })).toThrow(name);
    expect(() => loadConfig({ ...good, [name]: "0" })).toThrow(name);
  });

  it.each([["", "empty"], ["ab".repeat(31), "too short"], ["zz".repeat(32), "not hex"], ["ab".repeat(33), "too long"]])(
    "refuses to start when MODEL_KEY_ENCRYPTION_SECRET is %j (%s) without printing it", (value) => {
      expect(() => loadConfig({ ...good, MODEL_KEY_ENCRYPTION_SECRET: value })).toThrow("MODEL_KEY_ENCRYPTION_SECRET");
      try { loadConfig({ ...good, MODEL_KEY_ENCRYPTION_SECRET: value }); } catch (e) { if (value) expect((e as Error).message).not.toContain(value); }
    });

  it("treats NODE_ENV=production as production and anything else as not", () => {
    expect(loadConfig({ ...good, NODE_ENV: "production" }).production).toBe(true);
    expect(loadConfig({ ...good, NODE_ENV: "test" }).production).toBe(false);
  });

  it("defaults the global LLM cap to 8 per minute and lets GLOBAL_LLM_CAP_PER_MINUTE override it", () => {
    expect(loadConfig(good).globalLlmCapPerMinute).toBe(8);
    expect(loadConfig({ ...good, GLOBAL_LLM_CAP_PER_MINUTE: "20" }).globalLlmCapPerMinute).toBe(20);
  });

  it("lets an environment variable override a config.json tunable", () => {
    expect(loadConfig({ ...good, INGEST_TIMEOUT_MS: "1234" }).ingestTimeoutMs).toBe(1234);
  });

  it("has the dashboard tunables in config.json and lets the environment override them", () => {
    const c = loadConfig(good);
    expect([c.unansweredScoreBelow, c.unansweredPageSize, c.passageMaxChars]).toEqual([0.3, 50, 300]);
    const o = loadConfig({ ...good, UNANSWERED_SCORE_BELOW: "0.45", UNANSWERED_PAGE_SIZE: "7", PASSAGE_MAX_CHARS: "120" });
    expect([o.unansweredScoreBelow, o.unansweredPageSize, o.passageMaxChars]).toEqual([0.45, 7, 120]);
  });

  describe("mail settings", () => {
    const smtp = "smtp://mailuser:mail-SECRET@smtp.example.test:587";
    it("are optional outside production", () => {
      const c = loadConfig(good);
      expect([c.smtpUrl, c.mailFrom]).toEqual(["", "Lumen <no-reply@localhost>"]); // empty SMTP_URL: dev prints the link instead
      expect(loadConfig({ ...good, NODE_ENV: "test" }).smtpUrl).toBe("");
    });

    it("reads SMTP_URL and MAIL_FROM", () => {
      const c = loadConfig({ ...good, SMTP_URL: smtp, MAIL_FROM: "Lumen <hi@example.test>" });
      expect([c.smtpUrl, c.mailFrom]).toEqual([smtp, "Lumen <hi@example.test>"]);
    });

    it.each(["", undefined])("refuse to start in production when SMTP_URL is %j, naming it", (value) => {
      const env: Record<string, string | undefined> = { ...good, NODE_ENV: "production", MAIL_FROM: "Lumen <hi@example.test>", SMTP_URL: value };
      expect(() => loadConfig(env)).toThrow("SMTP_URL");
    });

    it("refuse to start in production without MAIL_FROM, and never print the SMTP URL", () => {
      const env = { ...good, NODE_ENV: "production", SMTP_URL: smtp };
      expect(() => loadConfig(env)).toThrow("MAIL_FROM");
      try { loadConfig(env); } catch (e) { expect((e as Error).message).not.toMatch(/mail-SECRET|smtp\.example/); }
      expect(loadConfig({ ...env, MAIL_FROM: "Lumen <hi@example.test>" }).production).toBe(true);
    });
  });

  it("has the project and verification tunables in config.json and lets the environment override them", () => {
    const c = loadConfig(good);
    expect([c.projectNameMaxChars, c.projectDescriptionMaxChars, c.verificationResendWindowSeconds, c.verificationResendMax, c.verificationEmailExpiresSeconds]).toEqual([60, 500, 60, 3, 3600]);
    expect(loadConfig({ ...good, PROJECT_NAME_MAX_CHARS: "30", VERIFICATION_RESEND_MAX: "1" })).toMatchObject({ projectNameMaxChars: 30, verificationResendMax: 1 });
  });
});
