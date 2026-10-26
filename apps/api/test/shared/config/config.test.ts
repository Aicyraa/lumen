import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/shared/config/config.js";
import { goodEnv } from "../../helpers/env.js";

const good = goodEnv;

describe("loadConfig", () => {
  it("reads the limits from the environment", () => {
    const c = loadConfig(good);
    expect([c.maxDocuments, c.ratePerMinute, c.maxRequestsPerMonth, c.maxProjectsPerUser]).toEqual([
      7, 5, 99, 4,
    ]);
  });

  it("adds http:// to a scheme-less host:port (Render's fromService hostport)", () => {
    expect(loadConfig({ ...good, RAG_SERVICE_URL: "lumen-rag-ab12:8000" }).ragUrl).toBe(
      "http://lumen-rag-ab12:8000",
    );
    expect(loadConfig({ ...good, RAG_SERVICE_URL: "https://rag.example.com/" }).ragUrl).toBe(
      "https://rag.example.com",
    );
  });

  it.each(Object.keys(good))(
    "refuses to start when %s is missing, naming it but never printing a value",
    (name) => {
      const env: Record<string, string | undefined> = { ...good };
      delete env[name];
      expect(() => loadConfig(env)).toThrow(name);
      try {
        loadConfig(env);
      } catch (e) {
        expect((e as Error).message).not.toMatch(/internal-SECRET|pw-SECRET|s{32}/);
      }
    },
  );

  it.each([
    "MAX_DOCUMENTS_PER_TENANT",
    "RATE_LIMIT_PER_MINUTE",
    "MAX_REQUESTS_PER_MONTH",
    "MAX_PROJECTS_PER_USER",
  ])("refuses an empty or non-positive %s", (name) => {
    expect(() => loadConfig({ ...good, [name]: "" })).toThrow(name);
    expect(() => loadConfig({ ...good, [name]: "0" })).toThrow(name);
  });

  it.each([
    ["", "empty"],
    ["ab".repeat(31), "too short"],
    ["zz".repeat(32), "not hex"],
    ["ab".repeat(33), "too long"],
  ])(
    "refuses to start when MODEL_KEY_ENCRYPTION_SECRET is %j (%s) without printing it",
    (value) => {
      expect(() => loadConfig({ ...good, MODEL_KEY_ENCRYPTION_SECRET: value })).toThrow(
        "MODEL_KEY_ENCRYPTION_SECRET",
      );
      try {
        loadConfig({ ...good, MODEL_KEY_ENCRYPTION_SECRET: value });
      } catch (e) {
        if (value) expect((e as Error).message).not.toContain(value);
      }
    },
  );

  it("is production unless NODE_ENV is development or test", () => {
    const mail = { SMTP_URL: "smtp://x", MAIL_FROM: "a@b.test" };
    for (const v of ["production", "staging", "prod", "Production"])
      expect(loadConfig({ ...good, ...mail, NODE_ENV: v }).production, v).toBe(true);
    for (const v of ["development", "test"])
      expect(loadConfig({ ...good, NODE_ENV: v }).production, v).toBe(false);
  });

  it("a production-like NODE_ENV needs the mail settings, whatever it is spelled", () => {
    expect(() => loadConfig({ ...good, NODE_ENV: "staging" })).toThrow("SMTP_URL");
  });

  it.each([undefined, "", "  "])(
    "refuses to start when NODE_ENV is %j, saying what to set and never opening dev shortcuts",
    (value) => {
      const env: Record<string, string | undefined> = { ...good, NODE_ENV: value };
      expect(() => loadConfig(env)).toThrow(/NODE_ENV is not set.*development, test or production/);
    },
  );

  it("refuses a numeric override that is not a number, naming the variable", () => {
    expect(() => loadConfig({ ...good, UPLOAD_MAX_BYTES: "10MB" })).toThrow(
      "invalid environment variable UPLOAD_MAX_BYTES",
    );
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

    it.each(["", undefined])(
      "refuse to start in production when SMTP_URL is %j, naming it",
      (value) => {
        const env: Record<string, string | undefined> = {
          ...good,
          NODE_ENV: "production",
          MAIL_FROM: "Lumen <hi@example.test>",
          SMTP_URL: value,
        };
        expect(() => loadConfig(env)).toThrow("SMTP_URL");
      },
    );

    it("refuse to start in production without MAIL_FROM, and never print the SMTP URL", () => {
      const env = { ...good, NODE_ENV: "production", SMTP_URL: smtp };
      expect(() => loadConfig(env)).toThrow("MAIL_FROM");
      try {
        loadConfig(env);
      } catch (e) {
        expect((e as Error).message).not.toMatch(/mail-SECRET|smtp\.example/);
      }
      expect(loadConfig({ ...env, MAIL_FROM: "Lumen <hi@example.test>" }).production).toBe(true);
    });
  });

  describe("TRUST_PROXY", () => {
    it("is off unless set", () => {
      expect(loadConfig(good).trustProxy).toBe(false);
      for (const v of ["", "false", "0"])
        expect(loadConfig({ ...good, TRUST_PROXY: v }).trustProxy).toBe(false);
    });
    it("takes a number of proxy hops or a list of trusted addresses", () => {
      expect(loadConfig({ ...good, TRUST_PROXY: "1" }).trustProxy).toBe(1);
      expect(loadConfig({ ...good, TRUST_PROXY: "loopback, 10.0.0.0/8" }).trustProxy).toBe(
        "loopback, 10.0.0.0/8",
      );
    });
    it("refuses `true` (it would trust any client's X-Forwarded-For), naming the variable", () => {
      expect(() => loadConfig({ ...good, TRUST_PROXY: "true" })).toThrow("TRUST_PROXY");
    });
  });
});
