import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({
    ratePerMinute: 100000,
    globalLlmCapPerMinute: 1000,
    maxRequestsPerMonth: 100000,
  });
  a = await ctx.createTenant("a");
});
afterAll(async () => {
  await ctx.close();
});
afterEach(async () => {
  ctx.stub.reset();
  await ctx.pool.query("DELETE FROM tenant_models WHERE tenant_id = $1", [a.tenantId]);
  await ctx.pool.query("DELETE FROM model_calls WHERE tenant_id = $1", [a.tenantId]);
  await ctx.pool.query("DELETE FROM request_logs WHERE tenant_id = $1", [a.tenantId]);
});

const chat = () =>
  request(ctx.app).post("/v1/chat").set("x-api-key", a.apiKey).send({ query: "q" });
const tryIt = () =>
  request(ctx.app).post("/api/dashboard/try").set("cookie", a.cookie).send({ query: "q" });
const attempt = (id: string, over: object = {}) => ({
  provider: "openai_compatible",
  model_id: "primary",
  tenant_model_id: id,
  tier: "cheap",
  outcome: "rate_limited",
  tokens_in: null,
  tokens_out: null,
  latency_ms: 20,
  rate_limits: { "retry-after": "120" },
  retry_after_seconds: 120,
  ...over,
});
const limited = (id: string, error: object = {}, headers: Record<string, string> = {}) => ({
  status: 429,
  headers: { "retry-after": "120", ...headers },
  body: {
    error: {
      code: "provider_rate_limited",
      message: "The model provider is rate limiting this workspace. Try again in about 2 minutes.",
      retry_after_seconds: 120,
      ...error,
    },
    attempts: [attempt(id)],
  },
});

describe.each([
  ["/v1/chat", chat],
  ["/api/dashboard/try", tryIt],
])("provider rate limit passthrough on %s", (_name, call) => {
  it("answers 429 provider_rate_limited with Retry-After and retry_after_seconds, and no attempts", async () => {
    const id = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () => limited(id);
    const res = await call();
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
    expect(res.body).toEqual({
      error: {
        code: "provider_rate_limited",
        message:
          "The model provider is rate limiting this workspace. Try again in about 2 minutes.",
        retry_after_seconds: 120,
      },
    });
  });

  it("logs status provider_rate_limited with no route, writes rate_limited model_calls and keeps the stored retry-after", async () => {
    const id = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () => limited(id);
    await call();
    const { rows: logs } = await ctx.pool.query(
      "SELECT id, status, model_tier FROM request_logs WHERE tenant_id = $1",
      [a.tenantId],
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "provider_rate_limited", model_tier: null });
    const { rows: mc } = await ctx.pool.query(
      "SELECT request_id, outcome FROM model_calls WHERE tenant_id = $1",
      [a.tenantId],
    );
    expect(mc).toEqual([{ request_id: logs[0].id, outcome: "rate_limited" }]);
    const { rows: tm } = await ctx.pool.query(
      "SELECT status, rate_limits FROM tenant_models WHERE id = $1 AND tenant_id = $2",
      [id, a.tenantId],
    );
    expect(tm[0]).toMatchObject({ status: "failing", rate_limits: { "retry-after": "120" } });
  });

  it("never relays provider text: the message is regenerated from the number, extra fields are dropped", async () => {
    const id = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () =>
      limited(id, { message: "Groq says sk-leaky-9999 on org-123", extra: "HOSTILE", detail: {} });
    const res = await call();
    expect(res.status).toBe(429);
    expect(JSON.stringify(res.body)).not.toMatch(/sk-leaky|HOSTILE|org-123|Groq/);
    expect(res.body.error.message).toBe(
      "The model provider is rate limiting this workspace. Try again in about 2 minutes.",
    );
  });

  it("falls back to the Retry-After header when the body has no number, and to 502 provider_error when neither is a valid number", async () => {
    const id = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () => limited(id, { retry_after_seconds: undefined });
    let res = await call();
    expect([res.status, res.headers["retry-after"], res.body.error.retry_after_seconds]).toEqual([
      429,
      "120",
      120,
    ]);
    ctx.stub.handlers.query = () =>
      limited(id, { retry_after_seconds: "soon" }, { "retry-after": "-5" });
    res = await call();
    expect([res.status, res.body.error.code]).toEqual([502, "provider_error"]);
  });

  it("keeps a 502 with attempts as 502 provider_error (no Retry-After)", async () => {
    const id = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () => ({
      status: 502,
      body: {
        error: { code: "provider_error", message: "x" },
        attempts: [attempt(id, { outcome: "error", rate_limits: null })],
      },
    });
    const res = await call();
    expect([res.status, res.body.error.code, res.headers["retry-after"]]).toEqual([
      502,
      "provider_error",
      undefined,
    ]);
    const { rows } = await ctx.pool.query("SELECT status FROM request_logs WHERE tenant_id = $1", [
      a.tenantId,
    ]);
    expect(rows[0].status).toBe("provider_error");
  });
});

describe("a provider_rate_limited request in analytics and the requests list", () => {
  it("counts as failed like provider_error, shows its status, and the tier filter still works", async () => {
    const id = await ctx.seedModel(a, "cheap", "primary");
    ctx.stub.handlers.query = () => limited(id);
    await chat();
    const cookie = { cookie: a.cookie };
    const sum = await request(ctx.app).get("/api/dashboard/analytics/summary").set(cookie);
    expect(sum.body.total_requests).toBe(1);
    expect(sum.body.route_mix.failed).toBe(1);
    expect(sum.body.latency_ms).toMatchObject({ median: null });
    const all = await request(ctx.app).get("/api/dashboard/requests").set(cookie);
    expect(all.body.items).toHaveLength(1);
    expect(all.body.items[0]).toMatchObject({ status: "provider_rate_limited", tier: null });
    const cheap = await request(ctx.app).get("/api/dashboard/requests?tier=cheap").set(cookie);
    expect(cheap.body.items).toHaveLength(0);
  });
});

describe("rate_limited_until on GET /api/dashboard/models/usage", () => {
  const set = (id: string, limits: object | null, ago: string) =>
    ctx.pool.query(
      `UPDATE tenant_models SET rate_limits = $2, rate_limits_seen_at = now() - $3::interval WHERE id = $1`,
      [id, limits && JSON.stringify(limits), ago],
    );
  const usage = (t: Tenant) =>
    request(ctx.app).get("/api/dashboard/models/usage").set("cookie", t.cookie);

  it("is retry-after after rate_limits_seen_at while still in the future, else null", async () => {
    const future = await ctx.seedModel(a, "cheap", "future");
    const past = await ctx.seedModel(a, "cheap", "past");
    await ctx.seedModel(a, "cheap", "none");
    const noHeader = await ctx.seedModel(a, "cheap", "noHeader");
    const junk = await ctx.seedModel(a, "cheap", "junk");
    await set(future, { "retry-after": "120" }, "20 seconds");
    await set(past, { "retry-after": "10" }, "60 seconds");
    await set(noHeader, { "x-ratelimit-remaining-requests": "0" }, "1 second");
    await set(junk, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }, "1 second");
    const res = await usage(a);
    const m = Object.fromEntries(
      res.body.models.map((x: { model_id: string }) => [x.model_id, x]),
    ) as Record<string, { rate_limited_until: string | null }>;
    const until = Date.parse(m.future.rate_limited_until as string);
    expect(until - Date.now()).toBeGreaterThan(90_000);
    expect(until - Date.now()).toBeLessThanOrEqual(100_000);
    expect(m.past.rate_limited_until).toBeNull();
    expect(m.none.rate_limited_until).toBeNull();
    expect(m.noHeader.rate_limited_until).toBeNull();
    expect(m.junk.rate_limited_until).toBeNull();
  });

  it("is tenant-scoped and also appears in analytics by_model", async () => {
    const b = await ctx.createTenant("b");
    const mine = await ctx.seedModel(a, "cheap", "mine");
    const theirs = await ctx.seedModel(b, "cheap", "theirs");
    await set(mine, { "retry-after": "120" }, "0 seconds");
    await set(theirs, { "retry-after": "120" }, "0 seconds");
    const ids = (r: { body: { models?: { id: string }[]; by_model?: { id: string }[] } }) =>
      (r.body.models ?? r.body.by_model)!.map((x) => x.id);
    expect(ids(await usage(a))).toEqual([mine]);
    expect(ids(await usage(b))).toEqual([theirs]);
    const sum = await request(ctx.app)
      .get("/api/dashboard/analytics/summary")
      .set("cookie", a.cookie);
    expect(sum.body.by_model).toHaveLength(1);
    expect(sum.body.by_model[0].rate_limited_until).toEqual(expect.any(String));
    await ctx.pool.query("DELETE FROM tenant_models WHERE tenant_id = $1", [b.tenantId]);
  });
});
