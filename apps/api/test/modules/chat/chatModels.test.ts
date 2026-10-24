import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant, b: Tenant;
const KEY_A = "sk-tenant-a-key-AAAA1111";
beforeAll(async () => {
  ctx = await makeCtx({ ratePerMinute: 100000, globalLlmCapPerMinute: 1000, maxRequestsPerMonth: 100000 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => { await ctx.close(); });
afterEach(async () => {
  ctx.stub.reset();
  const ids = [a.tenantId, b.tenantId];
  await ctx.pool.query("DELETE FROM tenant_models WHERE tenant_id = ANY($1)", [ids]);
  await ctx.pool.query("DELETE FROM model_calls WHERE tenant_id = ANY($1)", [ids]);
  await ctx.pool.query("DELETE FROM request_logs WHERE tenant_id = ANY($1)", [ids]);
  await ctx.pool.query("DELETE FROM documents WHERE tenant_id = ANY($1)", [ids]);
});

const chat = (t: Tenant, body: object = { query: "q" }) => request(ctx.app).post("/v1/chat").set("x-api-key", t.apiKey).send(body);
const tryIt = (t: Tenant, body: object = { query: "q" }) => request(ctx.app).post("/api/dashboard/try").set("cookie", t.cookie).send(body);
const calls = (tenantId: string) => ctx.pool.query("SELECT * FROM model_calls WHERE tenant_id = $1 ORDER BY id", [tenantId]).then((r) => r.rows);
const model = (tenantId: string, id: string) => ctx.pool.query("SELECT * FROM tenant_models WHERE id = $1 AND tenant_id = $2", [id, tenantId]).then((r) => r.rows[0]);
const setPrice = (id: string, input: number | null, output: number | null) =>
  ctx.pool.query("UPDATE tenant_models SET input_price_per_1m = $2, output_price_per_1m = $3 WHERE id = $1", [id, input, output]);
const queryCall = () => ctx.stub.calls.filter((c) => c.name === "query").at(-1)!;
const attempt = (over: object = {}) => ({
  provider: "openai_compatible", model_id: "m", tenant_model_id: null, tier: "cheap", outcome: "ok",
  tokens_in: 812, tokens_out: 96, latency_ms: 300, rate_limits: null, ...over,
});
const answerWith = (attempts: object[], extra: object = {}) => ({ status: 200, body: {
  request_id: randomUUID(), answer: "A", sources: [],
  route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.7 },
  usage: { tokens_in: 812, tokens_out: 96, cost_usd: null, latency_ms: 5 }, attempts, ...extra } });

describe("what Express sends to /internal/query", () => {
  it("sends the tenant's models in tier order with decrypted keys, and only that tenant's", async () => {
    const c0 = await ctx.seedModel(a, "cheap", "c0", KEY_A);
    await ctx.seedModel(a, "cheap", "c1", "sk-second-key-BBBB2222");
    await ctx.seedModel(a, "expensive", "e0", KEY_A);
    await ctx.seedModel(a, "fallback", "f0", KEY_A);
    await ctx.seedModel(b, "cheap", "b-secret-model", "sk-tenant-b-key-ZZZZ9999");
    expect((await chat(a)).status).toBe(200);
    const body = queryCall().body as { tenant_id: string; models: Record<string, Record<string, string>[]>; include_snippets?: boolean };
    expect(body.tenant_id).toBe(a.tenantId);
    expect(body.include_snippets).toBeUndefined();
    expect(body.models.cheap.map((m) => m.model_id)).toEqual(["c0", "c1"]);
    expect(body.models.expensive.map((m) => m.model_id)).toEqual(["e0"]);
    expect(body.models.fallback.map((m) => m.model_id)).toEqual(["f0"]);
    expect(body.models.cheap[0]).toEqual({ provider: "openai_compatible", model_id: "c0", endpoint_url: "https://api.example.test/v1", api_key: KEY_A, tenant_model_id: c0 });
    expect(JSON.stringify(body)).not.toContain("tenant-b-key");
  });

  it("Try it sends include_snippets: true, /v1/chat does not", async () => {
    await ctx.seedModel(a, "cheap", "c0");
    await tryIt(a);
    expect(queryCall().body.include_snippets).toBe(true);
    await chat(a);
    expect(queryCall().body.include_snippets).toBeUndefined();
  });

  it("without models, outside production, sends no `models` so Python uses the env default", async () => {
    expect((await chat(a)).status).toBe(200);
    expect(queryCall().body).not.toHaveProperty("models");
  });
});

describe("no models in production", () => {
  it("returns 422 no_models_configured on both routes and never calls the service", async () => {
    const prod = await makeCtx({ production: true, ratePerMinute: 1000, globalLlmCapPerMinute: 1000 });
    try {
      const t = await prod.createTenant("p");
      for (const res of [
        await request(prod.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" }),
        await request(prod.app).post("/api/dashboard/try").set("cookie", t.cookie).send({ query: "q" }),
      ]) {
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("no_models_configured");
        expect(res.body.error.message).toMatch(/Models/);
      }
      expect(prod.stub.calls).toHaveLength(0);
      await prod.seedModel(t, "cheap", "now-configured");
      expect((await request(prod.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" })).status).toBe(200);
    } finally { await prod.close(); }
  });
});

describe("what the client gets back", () => {
  it("strips attempts, rate-limit data and keys from the public response", async () => {
    const id = await ctx.seedModel(a, "cheap", "c0", KEY_A);
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: id, rate_limits: { "x-ratelimit-remaining-requests": "5" } })],
      { api_key: KEY_A, rate_limits: { x: 1 } });
    const res = await chat(a);
    expect(Object.keys(res.body).sort()).toEqual(["answer", "request_id", "route", "sources", "usage"]);
    expect(JSON.stringify(res.body)).not.toMatch(/attempts|rate_limit|api_key|tenant-a-key/);
  });

  it("/v1/chat returns ids and scores only per source; Try it adds filename (tenant-scoped join) and a capped snippet", async () => {
    const mine = (await ctx.pool.query("INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'mine.md', 'ready') RETURNING id", [a.tenantId])).rows[0].id;
    const theirs = (await ctx.pool.query("INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'theirs-secret.md', 'ready') RETURNING id", [b.tenantId])).rows[0].id;
    ctx.stub.handlers.query = () => answerWith([attempt()], { sources: [
      { document_id: mine, chunk_id: 1, score: 0.9, filename: "lie.txt", snippet: "S".repeat(500), content: "FULL CHUNK" },
      { document_id: theirs, chunk_id: 2, score: 0.8, filename: "theirs-secret.md", snippet: "other tenant text" },
      { document_id: randomUUID(), chunk_id: 3, score: 0.7, snippet: "orphan" }] });
    const v1 = await chat(a);
    expect(v1.body.sources).toEqual([
      { document_id: mine, chunk_id: 1, score: 0.9 }, { document_id: theirs, chunk_id: 2, score: 0.8 }, { document_id: expect.any(String), chunk_id: 3, score: 0.7 }]);
    const t = await tryIt(a);
    expect(t.body.sources[0]).toEqual({ document_id: mine, chunk_id: 1, score: 0.9, filename: "mine.md", snippet: "S".repeat(ctx.config.snippetMaxChars) });
    expect(t.body.sources[1].filename).toBeNull(); // tenant B's document is invisible to tenant A
    expect(JSON.stringify(t.body)).not.toContain("theirs-secret");
    expect(JSON.stringify(t.body)).not.toContain("FULL CHUNK");
    expect(t.body.sources[2].filename).toBeNull();
  });

  it("never stores or logs a snippet: request_logs and the log output hold ids and scores only", async () => {
    ctx.stub.handlers.query = () => answerWith([attempt()], { sources: [{ document_id: randomUUID(), chunk_id: 1, score: 0.9, snippet: "SNIPPET-MARKER-TEXT" }] });
    ctx.logLines.length = 0;
    expect((await tryIt(a)).body.sources[0].snippet).toBe("SNIPPET-MARKER-TEXT");
    const row = (await ctx.pool.query("SELECT * FROM request_logs WHERE tenant_id = $1", [a.tenantId])).rows[0];
    expect(JSON.stringify(row)).not.toContain("SNIPPET-MARKER");
    expect(ctx.logLines.join("")).not.toContain("SNIPPET-MARKER");
  });

  it("maps a service no_models_configured to 422 and any other service failure to 502 provider_error, with Express's own messages", async () => {
    ctx.stub.handlers.query = () => ({ status: 422, body: { error: { code: "no_models_configured", message: "UPSTREAM-TEXT sk-leaky-1234" } } });
    let res = await chat(a);
    expect([res.status, res.body.error.code]).toEqual([422, "no_models_configured"]);
    expect(JSON.stringify(res.body)).not.toContain("UPSTREAM-TEXT");
    ctx.stub.handlers.query = () => ({ status: 502, body: { error: { code: "provider_error", message: "UPSTREAM-TEXT sk-leaky-1234" } } });
    res = await chat(a);
    expect([res.status, res.body.error.code]).toEqual([502, "provider_error"]);
    expect(JSON.stringify(res.body)).not.toContain("sk-leaky");
  });
});

describe("model_calls and tenant_models bookkeeping", () => {
  it("writes one tenant-scoped model_calls row for a plain call, tied to the request_logs row", async () => {
    const res = await chat(a);
    const rows = await calls(a.tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ request_id: res.body.request_id, tenant_model_id: null, tier: "default", outcome: "ok", tokens_in: 812, tokens_out: 96, latency_ms: 700, cost_usd: null, cost_source: null });
    expect(await calls(b.tenantId)).toHaveLength(0);
  });

  it("writes one row per attempt when a request falls back, in order, and marks failing and connected models", async () => {
    const [p, bk, fb] = [await ctx.seedModel(a, "cheap", "primary"), await ctx.seedModel(a, "cheap", "backup"), await ctx.seedModel(a, "fallback", "fb")];
    ctx.stub.handlers.query = () => answerWith([
      attempt({ model_id: "primary", tenant_model_id: p, outcome: "rate_limited", tokens_in: null, tokens_out: null, latency_ms: 40 }),
      attempt({ model_id: "backup", tenant_model_id: bk, outcome: "timeout", tokens_in: null, tokens_out: null, latency_ms: 9000 }),
      attempt({ model_id: "fb", tenant_model_id: fb, tier: "fallback" })]);
    const res = await chat(a);
    expect(res.status).toBe(200);
    const rows = await calls(a.tenantId);
    expect(rows.map((r) => [r.model_id, r.tier, r.outcome, r.tenant_model_id])).toEqual([
      ["primary", "cheap", "rate_limited", p], ["backup", "cheap", "timeout", bk], ["fb", "fallback", "ok", fb]]);
    expect(new Set(rows.map((r) => r.request_id))).toEqual(new Set([res.body.request_id]));
    expect((await model(a.tenantId, p)).status).toBe("failing");
    expect((await model(a.tenantId, fb)).status).toBe("connected");
  });

  it("records every attempt when all models fail (502 provider_error), against the logged failed request", async () => {
    const p = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () => ({ status: 502, body: { error: { code: "provider_error", message: "x" },
      attempts: [attempt({ model_id: "primary", tenant_model_id: p, outcome: "error", tokens_in: null, tokens_out: null })] } });
    const res = await chat(a);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("attempts");
    const logRow = (await ctx.pool.query("SELECT id, status FROM request_logs WHERE tenant_id = $1", [a.tenantId])).rows[0];
    expect(logRow.status).toBe("provider_error");
    const rows = await calls(a.tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ request_id: logRow.id, outcome: "error", tenant_model_id: p });
    expect((await model(a.tenantId, p)).status).toBe("failing");
  });

  it("fills rate_limits and rate_limits_seen_at from the last attempt that reported them, and leaves null otherwise", async () => {
    const withHeaders = await ctx.seedModel(a, "cheap", "reports");
    const without = await ctx.seedModel(a, "expensive", "silent");
    ctx.stub.handlers.query = () => answerWith([
      attempt({ model_id: "reports", tenant_model_id: withHeaders, rate_limits: { "x-ratelimit-remaining-requests": "7" } }),
      attempt({ model_id: "reports", tenant_model_id: withHeaders, rate_limits: { "x-ratelimit-remaining-requests": "6", "x-ratelimit-limit-requests": "30" } }),
      attempt({ model_id: "silent", tenant_model_id: without, tier: "expensive" })]);
    await chat(a);
    const r = await model(a.tenantId, withHeaders);
    expect(r.rate_limits).toEqual({ "x-ratelimit-remaining-requests": "6", "x-ratelimit-limit-requests": "30" });
    expect(r.rate_limits_seen_at).toBeInstanceOf(Date);
    const s = await model(a.tenantId, without);
    expect([s.rate_limits, s.rate_limits_seen_at]).toEqual([null, null]);
  });

  it("ignores a tenant_model_id that belongs to another tenant: no write to their model, call stored unlinked", async () => {
    const theirs = await ctx.seedModel(b, "cheap", "b-model");
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: theirs, outcome: "error", rate_limits: { "x-ratelimit-remaining-requests": "0" } })]);
    await chat(a);
    expect((await calls(a.tenantId))[0].tenant_model_id).toBeNull();
    expect(await calls(b.tenantId)).toHaveLength(0);
    const m = await model(b.tenantId, theirs);
    expect([m.status, m.rate_limits]).toEqual(["connected", null]);
  });

  it("a request with no model call (tier none) writes no model_calls rows", async () => {
    ctx.stub.handlers.query = () => answerWith([], { route: { model_tier: "none", k: 0, escalated: false, difficulty: 0, top_score: null } });
    expect((await chat(a)).status).toBe(200);
    expect(await calls(a.tenantId)).toHaveLength(0);
  });
});

describe("estimated provider cost", () => {
  const costOf = async (tenantId: string) => (await ctx.pool.query("SELECT cost_usd FROM request_logs WHERE tenant_id = $1", [tenantId])).rows[0].cost_usd;

  it("prices an attempt from the provider's token counts: 812 in and 96 out at 0.15 and 0.60 per 1M is 0.000179", async () => {
    const id = await ctx.seedModel(a, "cheap", "priced");
    await setPrice(id, 0.15, 0.6); // by hand: 812/1e6*0.15 + 96/1e6*0.60 = 0.0001218 + 0.0000576 = 0.0001794
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: id })]);
    const res = await chat(a);
    expect(res.body.usage.cost_usd).toBe(0.000179);
    expect(Number((await calls(a.tenantId))[0].cost_usd)).toBe(0.000179);
    expect((await calls(a.tenantId))[0].cost_source).toBe("estimated");
    expect(Number(await costOf(a.tenantId))).toBe(0.000179);
  });

  it("sums the attempts of a request that fell back; failed attempts without tokens add nothing", async () => {
    const p = await ctx.seedModel(a, "cheap", "primary"); const bk = await ctx.seedModel(a, "cheap", "backup");
    await setPrice(p, 5, 5); await setPrice(bk, 1, 2); // backup: 812/1e6*1 + 96/1e6*2 = 0.001004
    ctx.stub.handlers.query = () => answerWith([
      attempt({ tenant_model_id: p, outcome: "error", tokens_in: null, tokens_out: null }),
      attempt({ tenant_model_id: bk })]);
    const res = await chat(a);
    expect(res.body.usage.cost_usd).toBe(0.001004);
    expect(Number(await costOf(a.tenantId))).toBe(0.001004);
  });

  it("is null, not zero, for an unpriced model, on the response, model_calls and request_logs", async () => {
    const id = await ctx.seedModel(a, "cheap", "unpriced");
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: id })]);
    const res = await chat(a);
    expect(res.body.usage.cost_usd).toBeNull();
    expect((await calls(a.tenantId))[0]).toMatchObject({ cost_usd: null, cost_source: null });
    expect(await costOf(a.tenantId)).toBeNull();
  });

  it("a model priced at 0 and 0 (free) costs 0, not null; one price alone leaves it unpriced", async () => {
    const free = await ctx.seedModel(a, "cheap", "free"); await setPrice(free, 0, 0);
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: free })]);
    expect((await chat(a)).body.usage.cost_usd).toBe(0);
    const half = await ctx.seedModel(a, "expensive", "half"); await setPrice(half, 1, null);
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: half, tier: "expensive" })]);
    expect((await chat(a)).body.usage.cost_usd).toBeNull();
  });

  it("prefers a provider-reported cost over the estimate, and uses it even for an unpriced model", async () => {
    const priced = await ctx.seedModel(a, "cheap", "priced"); await setPrice(priced, 0.15, 0.6);
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: priced, reported_cost_usd: 0.0042 })]);
    expect((await chat(a)).body.usage.cost_usd).toBe(0.0042);
    expect((await calls(a.tenantId))[0]).toMatchObject({ cost_source: "provider" });
    expect(Number((await calls(a.tenantId))[0].cost_usd)).toBe(0.0042);
    const unpriced = await ctx.seedModel(a, "expensive", "unpriced");
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: unpriced, tier: "expensive", reported_cost_usd: 0.01 })]);
    expect((await chat(a)).body.usage.cost_usd).toBe(0.01);
  });

  it("ignores reported_cost_usd unless the attempt succeeded and the value is a number >= 0", async () => {
    const id = await ctx.seedModel(a, "cheap", "priced"); await setPrice(id, 0.15, 0.6);
    for (const over of [{ outcome: "error", reported_cost_usd: 9 }, { outcome: "timeout", reported_cost_usd: 9 }, { outcome: "rate_limited", reported_cost_usd: 9 },
      { outcome: "ok", reported_cost_usd: -1 }, { outcome: "ok", reported_cost_usd: "9" }]) {
      ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: id, ...over })]);
      const res = await chat(a);
      // a failed attempt that still reports tokens is priced by estimate; the reported value never wins
      expect(res.body.usage.cost_usd, JSON.stringify(over)).toBe(0.000179);
      expect((await calls(a.tenantId)).at(-1)!.cost_source).toBe("estimated");
    }
  });

  it("Try it returns the same estimated usage.cost_usd", async () => {
    const id = await ctx.seedModel(a, "cheap", "priced"); await setPrice(id, 0.15, 0.6);
    ctx.stub.handlers.query = () => answerWith([attempt({ tenant_model_id: id })]);
    expect((await tryIt(a)).body.usage.cost_usd).toBe(0.000179);
  });
});

describe("global LLM cap applies only to the shared default key", () => {
  it("does not throttle a tenant with its own models, while a tenant without models still hits the cap", async () => {
    const capped = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 2, maxRequestsPerMonth: 100000 });
    try {
      const own = await capped.createTenant("own"); const shared = await capped.createTenant("shared");
      await capped.seedModel(own, "cheap", "mine");
      const post = (t: Tenant) => request(capped.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" });
      for (let i = 0; i < 6; i++) expect((await post(own)).status).toBe(200);
      expect((await post(shared)).status).toBe(200);
      expect((await post(shared)).status).toBe(200);
      const res = await post(shared);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("rate_limited");
      expect((await post(own)).status).toBe(200); // still fine
    } finally { await capped.close(); }
  });

  it("the per-tenant limit still applies to tenants with their own models", async () => {
    const limited = await makeCtx({ ratePerMinute: 2, globalLlmCapPerMinute: 1000, maxRequestsPerMonth: 100000 });
    try {
      const own = await limited.createTenant("own");
      await limited.seedModel(own, "cheap", "mine");
      const post = () => request(limited.app).post("/v1/chat").set("x-api-key", own.apiKey).send({ query: "q" });
      expect([(await post()).status, (await post()).status, (await post()).status]).toEqual([200, 200, 429]);
    } finally { await limited.close(); }
  });
});

describe("keys never reach logs", () => {
  it("no log line holds a tenant key across success, fallback and failure flows", async () => {
    await ctx.seedModel(a, "cheap", "c0", KEY_A);
    ctx.logLines.length = 0;
    await chat(a);
    ctx.stub.handlers.query = () => ({ status: 502, body: { error: { code: "provider_error", message: `boom ${KEY_A}` } } });
    await chat(a);
    ctx.stub.handlers.query = () => ({ status: 500, body: { error: { code: "x", message: KEY_A } } });
    await tryIt(a);
    expect(ctx.logLines.join("")).not.toContain(KEY_A);
  });
});
