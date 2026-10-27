import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertLog } from "../../helpers/seed.js";

type Item = { id: string; query: string; [k: string]: unknown };
let ctx: Ctx, a: Tenant, b: Tenant;
const ids: Record<string, string> = {};
const SRC = [{}]; // one source row = the answer cited something

beforeAll(async () => {
  ctx = await makeCtx({ unansweredScoreBelow: 0.4, unansweredPageSize: 3 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  const L = (t: Tenant, o: Parameters<typeof insertLog>[2]) => insertLog(ctx.pool, t.tenantId, o);
  const call = (t: Tenant, requestId: string, provider: string, model: string, ago: string) =>
    ctx.pool.query(
      `INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome, created_at)
       VALUES ($1, $2, $3, $4, 'cheap', 'ok', now() - $5::interval)`,
      [t.tenantId, requestId, provider, model, ago],
    );

  // no_match: tier none, or a best match below the threshold
  await L(a, {
    query: "none, no best match at all",
    tier: "none",
    topScore: null,
    k: 0,
    ago: "1 hour",
  });
  await L(a, {
    query: "weak but answered",
    tier: "cheap",
    topScore: 0.25,
    sources: SRC,
    ago: "2 hours",
  });
  await L(a, { query: "none with a score", tier: "none", topScore: 0.05, k: 0, ago: "5 hours" });
  await L(a, { query: "none, strong score", tier: "none", topScore: 0.9, k: 0, ago: "4 hours" });
  await L(a, {
    query: "weak, 10 days ago",
    tier: "cheap",
    topScore: 0.1,
    sources: SRC,
    ago: "10 days",
  });
  await L(a, {
    query: "weak, 11 days ago",
    tier: "cheap",
    topScore: 0.1,
    sources: SRC,
    ago: "11 days",
  });

  // not_found: a model ran, retrieval was at or above the threshold, status ok, no source cited
  ids.nf1 = await L(a, {
    query: "not found, two attempts",
    tier: "cheap",
    topScore: 0.7,
    difficulty: 0.2,
    escalated: true,
    ago: "1 hour",
  });
  await call(a, ids.nf1, "openai", "first-model", "61 minutes");
  await call(a, ids.nf1, "anthropic", "last-model", "60 minutes");
  ids.nf2 = await L(a, {
    query: "not found, no model_calls row",
    tier: "expensive",
    topScore: 0.5,
    ago: "2 hours",
  });
  await call(b, ids.nf2, "evil", "leaked-model", "2 hours"); // B's row for A's request id must not be joined
  await L(a, {
    query: "not found, score equals threshold",
    tier: "cheap",
    topScore: 0.4,
    ago: "3 hours",
  });
  await L(a, { query: "not found, 5 days ago", tier: "cheap", topScore: 0.6, ago: "5 days" });
  await L(a, { query: "not found, 12 days ago", tier: "cheap", topScore: 0.6, ago: "12 days" });

  // in neither group
  await L(a, {
    query: "answered with sources",
    tier: "cheap",
    topScore: 0.7,
    sources: SRC,
    ago: "3 hours",
  });
  await L(a, {
    query: "just above, cited",
    tier: "expensive",
    topScore: 0.45,
    sources: SRC,
    ago: "4 hours",
  });
  await L(a, {
    query: "provider failed, no score",
    tier: null,
    topScore: null,
    status: "provider_error",
    ago: "6 hours",
  });
  await L(a, {
    query: "provider failed, strong score",
    tier: "cheap",
    topScore: 0.8,
    status: "provider_error",
    ago: "6 hours",
  });
  await L(a, { query: "model ran, NULL score", tier: "cheap", topScore: null, ago: "6 hours" });
  await L(a, { query: "NULL tier, ok, strong score", tier: null, topScore: 0.9, ago: "6 hours" });

  // tenant B
  await L(b, { query: "B's weak question", tier: "none", topScore: 0.01, ago: "1 minute" });
  const bnf = await L(b, { query: "B's not found", tier: "cheap", topScore: 0.9, ago: "1 minute" });
  await call(b, bnf, "bprov", "bmodel", "1 minute");
});
afterAll(async () => {
  await ctx.close();
});

const unanswered = (t: Tenant | null, q = "") => {
  const r = request(ctx.app).get(`/api/dashboard/analytics/unanswered${q}`);
  return t ? r.set("cookie", t.cookie) : r;
};
const queries = (items: Item[]) => items.map((i) => i.query);

describe("GET /api/dashboard/analytics/unanswered", () => {
  it("needs a session", async () => {
    expect((await unanswered(null)).status).toBe(401);
  });

  it("no_match: tier none or a best match below the threshold, newest first, with query, score, tier and time", async () => {
    const res = await unanswered(a);
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
    expect(res.body.threshold).toBe(0.4);
    expect(res.body.no_match.total).toBe(4);
    expect(queries(res.body.no_match.items)).toEqual([
      "none, no best match at all",
      "weak but answered",
      "none, strong score",
    ]);
    expect(res.body.no_match.items[1]).toEqual({
      id: expect.any(String),
      query: "weak but answered",
      top_score: expect.closeTo(0.25, 5),
      tier: "cheap",
      time: expect.stringMatching(/Z$/),
    });
    expect(res.body.no_match.items[0].top_score).toBeNull();
  });

  it("not_found: a model ran, score at or above the threshold, status ok, no source cited; includes model, difficulty and escalated", async () => {
    const res = await unanswered(a);
    expect(res.body.not_found.total).toBe(4); // the 12 day old one is outside 7d
    expect(queries(res.body.not_found.items)).toEqual([
      "not found, two attempts",
      "not found, no model_calls row",
      "not found, score equals threshold",
    ]);
    expect(res.body.not_found.items[0]).toEqual({
      id: ids.nf1,
      query: "not found, two attempts",
      top_score: expect.closeTo(0.7, 5),
      tier: "cheap",
      model: { provider: "anthropic", model_id: "last-model" }, // the last attempt
      difficulty: expect.closeTo(0.2, 5),
      escalated: true,
      time: expect.stringMatching(/Z$/),
    });
    expect(res.body.not_found.items[1].model).toBeNull(); // no model_calls row for this tenant
  });

  it("the groups never overlap, and NULL tier, NULL score and failed calls are in neither", async () => {
    const res = await unanswered(a, "?range=30d");
    const nm = new Set(queries(res.body.no_match.items));
    const nf = queries(res.body.not_found.items);
    expect(nf.filter((q) => nm.has(q))).toEqual([]);
    // 30d: no_match 6 (page shows 3), not_found 5; every other seeded row is excluded
    expect([res.body.no_match.total, res.body.not_found.total]).toEqual([6, 5]);
    const text = JSON.stringify(res.body);
    for (const q of [
      "answered with sources",
      "just above, cited",
      "provider failed, no score",
      "provider failed, strong score",
      "model ran, NULL score",
      "NULL tier, ok, strong score",
    ])
      expect(text).not.toContain(q);
    expect(nf).not.toContain("none, strong score"); // tier none with a strong score is no_match only
  });

  it("caps each list at the configured page size; total counts the whole range", async () => {
    const res = await unanswered(a, "?range=30d");
    expect(res.body.no_match.items).toHaveLength(3);
    expect(res.body.not_found.items).toHaveLength(3);
    expect(res.body.no_match.total).toBe(6);
    expect(res.body.not_found.total).toBe(5);
  });

  it("rejects an unknown range with 422", async () => {
    const res = await unanswered(a, "?range=90d");
    expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
  });

  it("tenant A never sees tenant B's rows or B's model_calls", async () => {
    const text = JSON.stringify((await unanswered(a, "?range=30d")).body);
    for (const s of ["B's weak question", "B's not found", "leaked-model", "bmodel"])
      expect(text).not.toContain(s);
    const res = await unanswered(b);
    expect(queries(res.body.no_match.items)).toEqual(["B's weak question"]);
    expect(queries(res.body.not_found.items)).toEqual(["B's not found"]);
    expect(res.body.not_found.items[0].model).toEqual({ provider: "bprov", model_id: "bmodel" });
  });
});
