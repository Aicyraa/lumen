import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertLog } from "../../helpers/seed.js";

let ctx: Ctx, a: Tenant, b: Tenant, empty: Tenant;
// one second into the UTC day `n` days ago: always in the past, always inside that day
const dayStart = (n: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n, 0, 0, 1));
};
const at = (n: number) => dayStart(n).toISOString();
const dateOf = (n: number) => at(n).slice(0, 10);

beforeAll(async () => {
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000 });
  [a, b, empty] = [
    await ctx.createTenant("a"),
    await ctx.createTenant("b"),
    await ctx.createTenant("e"),
  ];
  const L = (t: Tenant, n: number, o: Parameters<typeof insertLog>[2]) =>
    insertLog(ctx.pool, t.tenantId, { createdAt: at(n), ...o });
  await L(a, 0, { tier: "cheap", latency: 100, cost: 0.001 });
  await L(a, 0, { tier: "cheap", latency: 300 }); // unpriced
  await L(a, 0, { tier: "expensive", escalated: true, latency: 900, cost: 0.01 });
  await L(a, 2, { tier: "expensive", escalated: false, latency: 1200, cost: 0.02 });
  await L(a, 2, { tier: "none", k: 0, latency: 5, topScore: 0.05 });
  await L(a, 2, {
    tier: null,
    status: "provider_error",
    latency: 2000,
    k: null,
    escalated: null,
    topScore: null,
  }); // failed: counted, not in latency
  await L(a, 10, { tier: "cheap", latency: 50, cost: 0.5 }); // only inside 30d
  await L(a, 40, { tier: "cheap", latency: 50, cost: 9 }); // outside both
  await L(b, 0, { tier: "expensive", escalated: true, latency: 7777, cost: 3 });
  // model_calls: same fixtures as the models usage endpoint, plus a fallback model
  const m = await ctx.seedModel(a, "cheap", "m1");
  const f = await ctx.seedModel(a, "fallback", "f1");
  const r = randomUUID();
  const call = (
    model: string,
    name: string,
    tier: string,
    outcome: string,
    tin: number | null,
    cost: number | null,
  ) =>
    ctx.pool.query(
      `INSERT INTO model_calls (tenant_id, request_id, tenant_model_id, provider, model_id, tier, outcome, tokens_in, tokens_out, latency_ms, cost_usd, created_at)
     VALUES ($1, $2, $3, 'openai_compatible', $4, $5, $6, $7, $7, 100, $8, $9)`,
      [a.tenantId, r, model, name, tier, outcome, tin, cost, at(0)],
    );
  await call(m, "m1", "cheap", "error", null, null);
  await call(f, "f1", "fallback", "ok", 30, 0.0005);
});
afterAll(async () => {
  await ctx.close();
});

const summary = (t: Tenant | null, q = "") => {
  const r = request(ctx.app).get(`/api/dashboard/analytics/summary${q}`);
  return t ? r.set("cookie", t.cookie) : r;
};

describe("GET /api/dashboard/analytics/summary", () => {
  it("needs a session", async () => {
    expect((await summary(null)).status).toBe(401);
  });

  it("totals the 7d range, zero-fills days with no traffic and splits each day cheap/expensive/none", async () => {
    const res = await summary(a);
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
    expect(res.body.total_requests).toBe(6);
    expect(res.body.per_day).toHaveLength(7);
    expect(res.body.per_day.map((d: { date: string }) => d.date)).toEqual(
      [6, 5, 4, 3, 2, 1, 0].map(dateOf),
    ); // oldest first, today last
    const day = (n: number) => res.body.per_day.find((d: { date: string }) => d.date === dateOf(n));
    expect(day(0)).toEqual({
      date: dateOf(0),
      cheap: 2,
      expensive: 1,
      none: 0,
      failed: 0,
      cost_usd: 0.011,
    });
    expect(day(2)).toEqual({
      date: dateOf(2),
      cheap: 0,
      expensive: 1,
      none: 1,
      failed: 1,
      cost_usd: 0.02,
    });
    expect(day(1)).toEqual({
      date: dateOf(1),
      cheap: 0,
      expensive: 0,
      none: 0,
      failed: 0,
      cost_usd: null,
    });
  });

  it("reports the route mix, median and p95 latency of answered requests, and the estimated provider cost total", async () => {
    const res = await summary(a);
    expect(res.body.route_mix).toEqual({
      cheap: 2,
      escalated: 1,
      expensive_hard: 1,
      none: 1,
      failed: 1,
    });
    expect(res.body.latency_ms).toEqual({ median: 300, p95: 1140 }); // 5, 100, 300, 900, 1200
    expect(res.body.total_cost_usd).toBeCloseTo(0.031, 6);
  });

  it("range=30d widens the window to 30 zero-filled days", async () => {
    const res = await summary(a, "?range=30d");
    expect(res.body.range).toBe("30d");
    expect(res.body.per_day).toHaveLength(30);
    expect(res.body.total_requests).toBe(7);
    expect(res.body.total_cost_usd).toBeCloseTo(0.531, 6);
    expect(res.body.route_mix.cheap).toBe(3);
  });

  it("by_model has the same per-model figures as /models/usage for the range, fallback models included", async () => {
    const usage = await request(ctx.app)
      .get("/api/dashboard/models/usage?range=7d")
      .set("cookie", a.cookie);
    const res = await summary(a);
    expect(res.body.by_model).toEqual(usage.body.models);
    expect(res.body.by_model.map((m: { model_id: string }) => m.model_id)).toEqual(["m1", "f1"]);
    expect(res.body.by_model[1]).toMatchObject({
      tier: "fallback",
      requests: 1,
      fallback_uses: 1,
      tokens_in: 30,
      cost_usd: 0.0005,
    });
  });

  it("a tenant with no traffic gets zeros and null cost and latency, no savings figure", async () => {
    const res = await summary(empty);
    expect(res.body).toEqual({
      range: "7d",
      total_requests: 0,
      per_day: expect.any(Array),
      route_mix: { cheap: 0, escalated: 0, expensive_hard: 0, none: 0, failed: 0 },
      latency_ms: { median: null, p95: null },
      total_cost_usd: null,
      by_model: [],
    });
    expect(res.body.per_day).toHaveLength(7);
    expect(JSON.stringify(res.body)).not.toMatch(/saving/i);
  });

  it("rejects an unknown range with 422", async () => {
    const res = await summary(a, "?range=1d");
    expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
  });

  it("tenant A's numbers never include tenant B's requests, and B sees only its own", async () => {
    const mine = await summary(a);
    expect(mine.body.total_requests).toBe(6); // B's 7777 ms / 3 USD request is not in here
    expect(mine.body.latency_ms.p95).toBeLessThan(7777);
    const theirs = await summary(b);
    expect(theirs.body).toMatchObject({
      total_requests: 1,
      route_mix: { escalated: 1, cheap: 0 },
      latency_ms: { median: 7777 },
      total_cost_usd: 3,
      by_model: [],
    });
  });
});
