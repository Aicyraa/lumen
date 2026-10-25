import { readFileSync } from "node:fs";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/shared/config/config.js";
import { type Ctx, makeCtx } from "../../helpers/ctx.js";
import { startProviderStub } from "../../helpers/providerStub.js";

const good = {
  DATABASE_URL: "postgresql://u:pw@localhost:5433/x",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DASHBOARD_ORIGIN: "http://localhost:5173",
  INTERNAL_SECRET: "i",
  RAG_SERVICE_URL: "http://localhost:8000",
  MAX_DOCUMENTS_PER_TENANT: "7",
  RATE_LIMIT_PER_MINUTE: "5",
  MAX_REQUESTS_PER_MONTH: "99",
  MAX_PROJECTS_PER_USER: "5",
  MODEL_KEY_ENCRYPTION_SECRET: "ab".repeat(32),
  NODE_ENV: "test",
};
const TUNABLES: [string, string][] = [
  ["modelAttemptsMax", "MODEL_ATTEMPTS_MAX"],
  ["rateLimitHeadersMax", "RATE_LIMIT_HEADERS_MAX"],
  ["modelTestMaxTokens", "MODEL_TEST_MAX_TOKENS"],
  ["endpointResponseMaxBytes", "ENDPOINT_RESPONSE_MAX_BYTES"],
  ["modelIdMaxChars", "MODEL_ID_MAX_CHARS"],
  ["endpointUrlMaxChars", "ENDPOINT_URL_MAX_CHARS"],
  ["apiKeyMaxChars", "API_KEY_MAX_CHARS"],
  ["apiKeyMinChars", "API_KEY_MIN_CHARS"],
  ["providerNameMaxChars", "PROVIDER_NAME_MAX_CHARS"],
  ["sessionIdMaxChars", "SESSION_ID_MAX_CHARS"],
  ["maxPricePerMillion", "MAX_PRICE_PER_MILLION"],
  ["endpointGuardCacheTtlMs", "ENDPOINT_GUARD_CACHE_TTL_MS"],
];

describe("rule 9: limits live in config.json / the environment", () => {
  it.each(TUNABLES)("%s has a default and %s overrides it", (key, envName) => {
    const c = loadConfig(good) as unknown as Record<string, number>;
    expect(c[key], `${key} default`).toBeGreaterThan(0);
    expect(
      (loadConfig({ ...good, [envName]: "4321" }) as unknown as Record<string, number>)[key],
    ).toBe(4321);
  });

  it("the attempts cap default is not the old literal 50", () => {
    expect(loadConfig(good).modelAttemptsMax).not.toBe(50);
  });

  it("no numeric limit literals remain in the Phase 3B source files", () => {
    const files = [
      "modules/models/models.routes.ts",
      "modules/chat/chat.routes.ts",
      "shared/services/modelCalls.ts",
      "modules/models/provider.ts",
      "shared/lib/endpointGuard.ts",
      "shared/middleware/tenantModels.ts",
    ];
    const bad =
      /\.(?:max|min|slice)\(\s*(?:0\s*,\s*)?(?:[2-9]|\d{2,})|_tokens:\s*\d|size\s*<=\s*\d/;
    for (const f of files) {
      const code = readFileSync(new URL(`../../../src/${f}`, import.meta.url), "utf8")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""));
      code.forEach((line, i) => {
        expect(line, `${f}:${i + 1}`).not.toMatch(bad);
      });
    }
  });
});

describe("the limits are actually read from config", () => {
  let ctx: Ctx, provider: Awaited<ReturnType<typeof startProviderStub>>;
  beforeAll(async () => {
    provider = await startProviderStub();
  });
  afterEach(async () => {
    provider.reset();
    await ctx.close();
  });
  const body = (over: object = {}) => ({
    provider: "openai_compatible",
    model_id: "small-1",
    endpoint_url: provider.url,
    api_key: provider.goodKey,
    tier: "cheap",
    ...over,
  });

  it("zod bounds on the add-model body, the Test & save token budget", async () => {
    ctx = await makeCtx({
      modelIdMaxChars: 5,
      endpointUrlMaxChars: 40,
      apiKeyMinChars: 3,
      modelTestMaxTokens: 7,
      ratePerMinute: 100,
    });
    const t = await ctx.createTenant("l");
    const post = (b: object) =>
      request(ctx.app).post("/api/dashboard/models").set("cookie", t.cookie).send(b);
    expect((await post(body({ model_id: "123456" }))).status).toBe(422);
    expect((await post(body({ endpoint_url: provider.url + "/" + "x".repeat(30) }))).status).toBe(
      422,
    ); // URL longer than endpointUrlMaxChars below
    expect(provider.calls).toHaveLength(0);
    const ok = await post(body({ model_id: "12345", api_key: provider.goodKey }));
    expect(ok.status).toBe(201);
    expect(provider.calls[0].body.max_tokens).toBe(7);
  });

  it("caps attempts per request and stored rate-limit headers", async () => {
    ctx = await makeCtx({
      modelAttemptsMax: 2,
      rateLimitHeadersMax: 1,
      ratePerMinute: 100,
      globalLlmCapPerMinute: 100,
    });
    const t = await ctx.createTenant("l");
    const id = await ctx.seedModel(t, "cheap", "m");
    const at = {
      provider: "p",
      model_id: "m",
      tenant_model_id: id,
      tier: "cheap",
      outcome: "ok",
      tokens_in: 1,
      tokens_out: 1,
      latency_ms: 1,
      rate_limits: { a: "1", b: "2", c: "3" },
    };
    ctx.stub.handlers.query = () => ({
      status: 200,
      body: {
        request_id: crypto.randomUUID(),
        answer: "A",
        sources: [],
        route: { model_tier: "cheap", k: 1, escalated: false, difficulty: 0, top_score: 0.5 },
        usage: { tokens_in: 1, tokens_out: 1, cost_usd: null, latency_ms: 1 },
        attempts: [at, at, at],
      },
    });
    await request(ctx.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" });
    expect(
      (await ctx.pool.query("SELECT 1 FROM model_calls WHERE tenant_id = $1", [t.tenantId]))
        .rowCount,
    ).toBe(2);
    const { rows } = await ctx.pool.query(
      "SELECT rate_limits FROM tenant_models WHERE id = $1 AND tenant_id = $2",
      [id, t.tenantId],
    );
    expect(Object.keys(rows[0].rate_limits)).toHaveLength(1);
  });

  it("caps session_id length from config", async () => {
    ctx = await makeCtx({ sessionIdMaxChars: 10, ratePerMinute: 100, globalLlmCapPerMinute: 100 });
    const t = await ctx.createTenant("l");
    const res = await request(ctx.app)
      .post("/v1/chat")
      .set("x-api-key", t.apiKey)
      .send({ query: "q", session_id: "x".repeat(11) });
    expect(res.status).toBe(422);
  });
});
