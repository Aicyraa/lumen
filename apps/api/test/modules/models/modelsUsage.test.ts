import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant, b: Tenant, m1: string, m2: string, f1: string, _idle: string;
type Call = {
  model?: string | null;
  tier: string;
  outcome: string;
  tin?: number | null;
  tout?: number | null;
  ms?: number | null;
  cost?: number | null;
  ago?: string;
};
const call = (tenantId: string, request_id: string, model: string | null, name: string, c: Call) =>
  ctx.pool.query(
    `INSERT INTO model_calls (tenant_id, request_id, tenant_model_id, provider, model_id, tier, outcome, tokens_in, tokens_out, latency_ms, cost_usd, cost_source, created_at)
   VALUES ($1, $2, $3, 'openai_compatible', $4, $5, $6, $7, $8, $9, $10, $11, now() - $12::interval)`,
    [
      tenantId,
      request_id,
      model,
      name,
      c.tier,
      c.outcome,
      c.tin ?? null,
      c.tout ?? null,
      c.ms ?? null,
      c.cost ?? null,
      c.cost == null ? null : "estimated",
      c.ago ?? "0 seconds",
    ],
  );

beforeAll(async () => {
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  [m1, m2, f1, _idle] = [
    await ctx.seedModel(a, "cheap", "m1"),
    await ctx.seedModel(a, "cheap", "m2"),
    await ctx.seedModel(a, "fallback", "f1"),
    await ctx.seedModel(a, "expensive", "idle"),
  ];
  await ctx.pool.query(
    "UPDATE tenant_models SET status = 'failing', rate_limits = $2, rate_limits_seen_at = now() WHERE id = $1",
    [m1, JSON.stringify({ "x-ratelimit-remaining-requests": "3" })],
  );
  const [r1, r2, r3, r4, old] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  await call(a.tenantId, r1, m1, "m1", {
    tier: "cheap",
    outcome: "ok",
    tin: 100,
    tout: 10,
    ms: 100,
    cost: 0.001,
  });
  await call(a.tenantId, r2, m1, "m1", {
    tier: "cheap",
    outcome: "ok",
    tin: 200,
    tout: 20,
    ms: 300,
    cost: 0.002,
  });
  await call(a.tenantId, r3, m1, "m1", { tier: "cheap", outcome: "error", ms: 50 });
  await call(a.tenantId, r3, m2, "m2", { tier: "cheap", outcome: "ok", tin: 50, tout: 5, ms: 200 });
  await call(a.tenantId, r4, m1, "m1", { tier: "cheap", outcome: "timeout", ms: 1000 });
  await call(a.tenantId, r4, m2, "m2", { tier: "cheap", outcome: "rate_limited", ms: 20 });
  await call(a.tenantId, r4, f1, "f1", {
    tier: "fallback",
    outcome: "ok",
    tin: 30,
    tout: 3,
    ms: 400,
    cost: 0.0005,
  });
  await call(a.tenantId, old, m1, "m1", {
    tier: "cheap",
    outcome: "ok",
    tin: 1000,
    tout: 100,
    ms: 900,
    cost: 0.01,
    ago: "10 days",
  });
  await call(a.tenantId, randomUUID(), null, "gone-model", {
    tier: "cheap",
    outcome: "ok",
    tin: 1,
    tout: 1,
    ms: 1,
    cost: 0.0001,
  }); // a since-deleted model
  await call(b.tenantId, randomUUID(), null, "b-model", {
    tier: "default",
    outcome: "ok",
    tin: 7,
    tout: 7,
    ms: 7,
    cost: 0.5,
  });
});
afterAll(async () => {
  await ctx.close();
});

const usage = (t: Tenant, q = "") =>
  request(ctx.app).get(`/api/dashboard/models/usage${q}`).set("cookie", t.cookie);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (body: { models: any[] }) =>
  Object.fromEntries(body.models.map((m) => [m.model_id, m])) as Record<string, any>;

describe("GET /api/dashboard/models/usage", () => {
  it("lists every model of the tenant (fallback and idle ones too) in tier then position order", async () => {
    const res = await usage(a);
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
    expect(res.body.models.map((m: { model_id: string }) => m.model_id)).toEqual([
      "m1",
      "m2",
      "idle",
      "f1",
    ]);
  });

  it("computes requests, tokens, failures by outcome, backup and fallback uses, median latency, status and limits from model_calls", async () => {
    const m = byName((await usage(a)).body);
    expect(m.m1).toMatchObject({
      tier: "cheap",
      status: "failing",
      requests: 4,
      tokens_in: 300,
      tokens_out: 30,
      failures: { error: 1, timeout: 1, rate_limited: 0 },
      backup_uses: 0,
      fallback_uses: 0,
      median_latency_ms: 200,
      rate_limits: { "x-ratelimit-remaining-requests": "3" },
      rate_limits_seen_at: expect.any(String),
    });
    expect(m.m2).toMatchObject({
      requests: 2,
      tokens_in: 50,
      tokens_out: 5,
      failures: { error: 0, timeout: 0, rate_limited: 1 },
      backup_uses: 1,
      fallback_uses: 0,
      median_latency_ms: 110,
    });
    expect(m.f1).toMatchObject({
      tier: "fallback",
      requests: 1,
      backup_uses: 0,
      fallback_uses: 1,
      median_latency_ms: 400,
    });
    expect(m.idle).toMatchObject({
      requests: 0,
      tokens_in: 0,
      tokens_out: 0,
      failures: { error: 0, timeout: 0, rate_limited: 0 },
      median_latency_ms: null,
      cost_usd: null,
      rate_limits: null,
      rate_limits_seen_at: null,
    });
    expect(JSON.stringify(m)).not.toMatch(/api_key|encrypted/);
  });

  it("estimated provider cost per model sums priced attempts and is null when nothing was priced; the total sums all calls in range", async () => {
    const res = await usage(a);
    const m = byName(res.body);
    expect([m.m1.cost_usd, m.m2.cost_usd, m.f1.cost_usd, m.idle.cost_usd]).toEqual([
      0.003,
      null,
      0.0005,
      null,
    ]);
    expect(res.body.total_cost_usd).toBeCloseTo(0.0036, 6); // 0.003 + 0.0005 + the deleted model's 0.0001
  });

  it("range=30d includes older calls; range=7d excludes them", async () => {
    const wide = await usage(a, "?range=30d");
    expect(wide.body.range).toBe("30d");
    expect(byName(wide.body).m1).toMatchObject({ requests: 5, tokens_in: 1300, cost_usd: 0.013 });
    expect(byName((await usage(a, "?range=7d")).body).m1.requests).toBe(4);
  });

  it.each(["?range=1d", "?range=", "?range=7d;drop"])(
    "rejects %s with 422 invalid_request",
    async (q) => {
      const res = await usage(a, q);
      expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
    },
  );

  it("tenant B sees none of tenant A's models, calls or cost, and A none of B's", async () => {
    const res = await usage(b);
    expect(res.status).toBe(200);
    expect(res.body.models).toEqual([]);
    expect(res.body.total_cost_usd).toBe(0.5); // only B's own call
    expect(JSON.stringify(res.body)).not.toContain("m1");
    expect((await usage(a)).body.total_cost_usd).toBeCloseTo(0.0036, 6); // B's 0.5 is not in A's total
  });
});
