import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertLog } from "../../helpers/seed.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ unansweredScoreBelow: 0.4, unansweredPageSize: 3 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  const L = (t: Tenant, o: Parameters<typeof insertLog>[2]) => insertLog(ctx.pool, t.tenantId, o);
  await L(a, {
    query: "none, no best match at all",
    tier: "none",
    topScore: null,
    k: 0,
    ago: "1 hour",
  });
  await L(a, { query: "weak but answered", tier: "cheap", topScore: 0.25, ago: "2 hours" });
  await L(a, { query: "good match", tier: "cheap", topScore: 0.7, ago: "3 hours" });
  await L(a, {
    query: "just above the threshold",
    tier: "expensive",
    topScore: 0.45,
    ago: "4 hours",
  });
  await L(a, { query: "none with a score", tier: "none", topScore: 0.05, k: 0, ago: "5 hours" });
  await L(a, {
    query: "provider failed",
    tier: null,
    topScore: null,
    status: "provider_error",
    ago: "6 hours",
  });
  await L(a, { query: "weak, 10 days ago", tier: "cheap", topScore: 0.1, ago: "10 days" });
  await L(a, { query: "weak, 11 days ago", tier: "cheap", topScore: 0.1, ago: "11 days" });
  await L(b, { query: "B's weak question", tier: "none", topScore: 0.01, ago: "1 minute" });
});
afterAll(async () => {
  await ctx.close();
});

const unanswered = (t: Tenant | null, q = "") => {
  const r = request(ctx.app).get(`/api/dashboard/analytics/unanswered${q}`);
  return t ? r.set("cookie", t.cookie) : r;
};
const queries = (res: request.Response) => res.body.items.map((i: { query: string }) => i.query);

describe("GET /api/dashboard/analytics/unanswered", () => {
  it("needs a session", async () => {
    expect((await unanswered(null)).status).toBe(401);
  });

  it("lists tier none and best-match scores below the configured threshold, newest first, with query, score and time", async () => {
    const res = await unanswered(a);
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
    expect(queries(res)).toEqual([
      "none, no best match at all",
      "weak but answered",
      "none with a score",
    ]);
    expect(res.body.items[1]).toEqual({
      id: expect.any(String),
      query: "weak but answered",
      top_score: expect.closeTo(0.25, 5),
      tier: "cheap",
      time: expect.stringMatching(/Z$/),
    });
    expect(res.body.items[0].top_score).toBeNull();
    expect(res.body.threshold).toBe(0.4); // so the page can say "best match below 0.40"
  });

  it("caps the list at the configured page size and reports how many matched", async () => {
    const res = await unanswered(a, "?range=30d");
    expect(res.body.items).toHaveLength(3);
    expect(res.body.total).toBe(5); // the 3 from the last 7 days plus the 10 and 11 day old ones
  });

  it("range=7d leaves out older questions", async () => {
    const res = await unanswered(a, "?range=7d");
    expect(res.body.total).toBe(3);
  });

  it("rejects an unknown range with 422", async () => {
    const res = await unanswered(a, "?range=90d");
    expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
  });

  it("tenant A never sees tenant B's questions", async () => {
    expect(JSON.stringify((await unanswered(a, "?range=30d")).body)).not.toContain(
      "B's weak question",
    );
    expect(queries(await unanswered(b))).toEqual(["B's weak question"]);
  });
});
