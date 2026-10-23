import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx } from "./helpers/ctx.js";

let ctx, a, b;
beforeAll(async () => {
  ctx = await makeCtx({ ratePerMinute: 1000, maxRequestsPerMonth: 5 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => { await ctx.close(); });
afterEach(() => ctx.stub.reset());

const chat = (tenant, body) => request(ctx.app).post("/v1/chat").set("x-api-key", tenant.apiKey).send(body);
const logs = (tenantId) => ctx.pool.query("SELECT * FROM request_logs WHERE tenant_id = $1 ORDER BY created_at", [tenantId]);
const resetLogs = () => ctx.pool.query("DELETE FROM request_logs WHERE tenant_id = ANY($1)", [[a.tenantId, b.tenantId]]);

describe("POST /v1/chat", () => {
  it("returns the service's answer and inserts exactly one request_logs row for the key's tenant", async () => {
    await resetLogs();
    ctx.stub.calls.length = 0;
    const res = await chat(a, { query: "When do you open?", session_id: "sess-1", tenant_id: b.tenantId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      request_id: expect.any(String),
      answer: "Stub answer [1]",
      route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.71 },
      usage: { tokens_in: 812, tokens_out: 96, cost_usd: null, latency_ms: 820 },
    });
    expect(ctx.stub.calls.find((c) => c.name === "query").body).toMatchObject({ tenant_id: a.tenantId, query: "When do you open?", session_id: "sess-1" });

    const rows = (await logs(a.tenantId)).rows;
    expect(rows).toHaveLength(1);
    expect((await logs(b.tenantId)).rows).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      id: res.body.request_id, tenant_id: a.tenantId, session_id: "sess-1", query: "When do you open?",
      model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.71,
      tokens_in: 812, tokens_out: 96, latency_ms: expect.any(Number), status: "ok", cost_usd: null,
    });
    expect(rows[0].api_key_id).toBeTruthy();
  });

  it("stores source ids and scores only, never chunk text or the answer", async () => {
    await resetLogs();
    const docId = randomUUID();
    ctx.stub.handlers.query = () => ({ status: 200, body: {
      request_id: randomUUID(), answer: "SECRET-ANSWER-TEXT",
      sources: [{ document_id: docId, chunk_id: 7, score: 0.5, content: "SECRET-CHUNK-TEXT" }],
      route: { model_tier: "expensive", k: 8, escalated: true, difficulty: 0.5, top_score: 0.5 },
      usage: { tokens_in: 1, tokens_out: 2, cost_usd: null, latency_ms: 3 },
    } });
    await chat(a, { query: "q" });
    const row = (await logs(a.tenantId)).rows[0];
    expect(row.sources).toEqual([{ document_id: docId, chunk_id: 7, score: 0.5 }]);
    expect(JSON.stringify(row)).not.toContain("SECRET");
  });

  it("logs the none tier with a null top_score when the tenant has no documents", async () => {
    await resetLogs();
    ctx.stub.handlers.query = () => ({ status: 200, body: {
      request_id: randomUUID(), answer: "No documents uploaded.", sources: [],
      route: { model_tier: "none", k: 0, escalated: false, difficulty: 0, top_score: null },
      usage: { tokens_in: 0, tokens_out: 0, cost_usd: null, latency_ms: 4 },
    } });
    const res = await chat(a, { query: "anything" });
    expect(res.body.route.top_score).toBeNull();
    expect((await logs(a.tenantId)).rows[0]).toMatchObject({ model_tier: "none", top_score: null, sources: [] });
  });

  it.each([[{}], [{ query: "" }], [{ query: "x".repeat(2001) }], [{ query: 5 }], [{ query: "ok", session_id: 7 }]])(
    "rejects invalid body #%# with 422 invalid_request, no log row and no service call", async (body) => {
      await resetLogs();
      ctx.stub.calls.length = 0;
      const res = await chat(a, body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("invalid_request");
      expect((await logs(a.tenantId)).rows).toHaveLength(0);
      expect(ctx.stub.calls).toHaveLength(0);
    });

  it("passes a provider failure through as 502 provider_error and still logs one row", async () => {
    await resetLogs();
    ctx.stub.handlers.query = () => ({ status: 502, body: { error: { code: "provider_error", message: "The language model provider failed." } } });
    const res = await chat(a, { query: "q" });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("provider_error");
    expect((await logs(a.tenantId)).rows).toMatchObject([{ status: "provider_error", model_tier: null }]);
  });

  it("a failing request_logs insert during a provider error does not replace the 502 provider_error", async () => {
    await resetLogs();
    ctx.stub.handlers.query = () => ({ status: 502, body: { error: { code: "provider_error", message: "down" } } });
    const res = await chat(a, { query: "bad \u0000 byte makes the Postgres insert fail" });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("provider_error");
  });

  it("returns 429 monthly_limit once the tenant has used MAX_REQUESTS_PER_MONTH", async () => {
    await resetLogs();
    for (let i = 0; i < 5; i++) await ctx.pool.query("INSERT INTO request_logs (tenant_id, query) VALUES ($1, 'old')", [b.tenantId]);
    const res = await chat(b, { query: "one too many" });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("monthly_limit");
    expect((await chat(a, { query: "other tenant is fine" })).status).toBe(200);
  });
});

describe("POST /v1/feedback", () => {
  const insertRequest = async (tenantId) => (await ctx.pool.query(
    "INSERT INTO request_logs (tenant_id, query) VALUES ($1, 'q') RETURNING id", [tenantId])).rows[0].id;
  const feedback = (tenant, body) => request(ctx.app).post("/v1/feedback").set("x-api-key", tenant.apiKey).send(body);

  it("stores the rating on the tenant's own request and returns 204", async () => {
    const id = await insertRequest(a.tenantId);
    expect((await feedback(a, { request_id: id, rating: -1 })).status).toBe(204);
    expect((await ctx.pool.query("SELECT feedback FROM request_logs WHERE id = $1", [id])).rows[0].feedback).toBe(-1);
  });

  it("another tenant's request id returns 404 and changes nothing", async () => {
    const id = await insertRequest(b.tenantId);
    const res = await feedback(a, { request_id: id, rating: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expect((await ctx.pool.query("SELECT feedback FROM request_logs WHERE id = $1", [id])).rows[0].feedback).toBeNull();
    expect((await feedback(a, { request_id: randomUUID(), rating: 1 })).status).toBe(404);
  });

  it.each([[{ request_id: randomUUID(), rating: 5 }], [{ rating: 1 }], [{ request_id: "nope", rating: 1 }]])(
    "rejects invalid feedback #%# with 422 invalid_request", async (body) => {
      const res = await feedback(a, body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("invalid_request");
    });
});
