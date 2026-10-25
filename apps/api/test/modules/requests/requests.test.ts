import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertLog } from "../../helpers/seed.js";

let ctx: Ctx, a: Tenant, b: Tenant;
const ids: Record<string, string> = {};
beforeAll(async () => {
  ctx = await makeCtx({ requestsPageSizeDefault: 3, requestsPageSizeMax: 5 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  ids.cheap = await insertLog(ctx.pool, a.tenantId, {
    query: "cheap one",
    tier: "cheap",
    k: 3,
    tokensIn: 100,
    tokensOut: 10,
    cost: 0.0012,
    latency: 300,
    ago: "1 hour",
  });
  ids.exp = await insertLog(ctx.pool, a.tenantId, {
    query: "expensive one",
    tier: "expensive",
    k: 8,
    escalated: true,
    latency: 900,
    ago: "2 hours",
  });
  ids.none = await insertLog(ctx.pool, a.tenantId, {
    query: "no answer",
    tier: "none",
    k: 0,
    topScore: 0.05,
    ago: "3 hours",
  });
  ids.failed = await insertLog(ctx.pool, a.tenantId, {
    query: "provider failed",
    tier: null,
    k: null,
    status: "provider_error",
    ago: "4 hours",
  });
  ids.old = await insertLog(ctx.pool, a.tenantId, { query: "ten days ago", ago: "10 days" });
  ids.b = await insertLog(ctx.pool, b.tenantId, { query: "B's secret question", ago: "1 minute" });
});
afterAll(async () => {
  await ctx.close();
});

const list = (t: Tenant | null, q = "") => {
  const r = request(ctx.app).get(`/api/dashboard/requests${q}`);
  return t ? r.set("cookie", t.cookie) : r;
};
type Item = { id: string; query: string };

describe("GET /api/dashboard/requests", () => {
  it("needs a session", async () => {
    expect((await list(null)).status).toBe(401);
  });

  it("lists the tenant's requests newest first with the fields the log table shows; the default page size comes from config", async () => {
    const res = await list(a);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: Item) => i.query)).toEqual([
      "cheap one",
      "expensive one",
      "no answer",
    ]); // 3 = requestsPageSizeDefault
    expect(res.body.next_cursor).toEqual(expect.any(String));
    expect(res.body.items[0]).toEqual({
      id: ids.cheap,
      time: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
      query: "cheap one",
      tier: "cheap",
      k: 3,
      escalated: false,
      latency_ms: 300,
      tokens_in: 100,
      tokens_out: 10,
      cost_usd: 0.0012,
      status: "ok",
    });
    expect(res.body.items[1]).toMatchObject({
      tier: "expensive",
      k: 8,
      escalated: true,
      cost_usd: null,
    });
  });

  it("filters by tier", async () => {
    const q = async (t: string) =>
      (await list(a, `?tier=${t}&range=30d`)).body.items.map((i: Item) => i.query);
    expect(await q("cheap")).toEqual(["cheap one", "ten days ago"]);
    expect(await q("expensive")).toEqual(["expensive one"]);
    expect(await q("none")).toEqual(["no answer"]);
    expect(await q("all")).toEqual(["cheap one", "expensive one", "no answer"]);
  });

  it("range=7d leaves out older requests and range=30d includes them", async () => {
    const all = async (range: string) =>
      (await list(a, `?range=${range}&limit=5`)).body.items.map((i: Item) => i.query);
    expect(await all("7d")).toEqual(["cheap one", "expensive one", "no answer", "provider failed"]);
    expect(await all("30d")).toContain("ten days ago");
  });

  it("pages with a keyset cursor over (created_at, id), including rows with identical timestamps, without gaps or repeats", async () => {
    const tie = "2026-01-01T00:00:00.123456Z";
    const tied = [] as string[];
    for (let i = 0; i < 6; i++)
      tied.push(await insertLog(ctx.pool, a.tenantId, { query: `tie ${i}`, createdAt: tie }));
    // a cursor walk over the whole 30d log must visit every row once, in (created_at desc, id desc) order
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const res = await list(
        a,
        `?range=30d&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((i: Item) => i.id));
      cursor = res.body.next_cursor;
      if (!cursor) break;
    }
    const { rows } = await ctx.pool.query(
      "SELECT id FROM request_logs WHERE tenant_id = $1 AND created_at >= now() - interval '30 days' ORDER BY created_at DESC, id DESC",
      [a.tenantId],
    );
    expect(seen).toEqual(rows.map((r: { id: string }) => r.id));
    expect(new Set(seen).size).toBe(seen.length);
    await ctx.pool.query("DELETE FROM request_logs WHERE id = ANY($1)", [tied]);
  });

  it("clamps limit to the configured maximum and rejects bad limit, cursor, tier and range with 422", async () => {
    expect((await list(a, "?range=30d&limit=1000")).body.items.length).toBeLessThanOrEqual(5);
    for (const q of ["?limit=0", "?limit=abc", "?cursor=nonsense", "?tier=bogus", "?range=1d"]) {
      const res = await list(a, q);
      expect([q, res.status, res.body.error?.code]).toEqual([q, 422, "invalid_request"]);
    }
  });

  it("tenant A never sees tenant B's requests, and B sees none of A's", async () => {
    const mine = (await list(a, "?range=30d&limit=5")).body.items.map((i: Item) => i.id);
    expect(mine).not.toContain(ids.b);
    const theirs = await list(b, "?range=30d");
    expect(theirs.body.items.map((i: Item) => i.id)).toEqual([ids.b]);
    expect(theirs.body.next_cursor).toBeNull();
  });

  it("rejects a cursor whose timestamp is not the exact microsecond ISO format with 422, never 500", async () => {
    const id = "3f0c1b2a-0000-4000-8000-000000000001";
    const enc = (ts: string) => Buffer.from(JSON.stringify([ts, id])).toString("base64url");
    for (const ts of [
      "1",
      "not a date",
      "2026-01-01T00:00:00.123456Z junk",
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00.123Z",
      "2026-01-01 00:00:00.123456",
      "2026-13-45T99:99:99.123456Z",
      "2026-02-31T00:00:00.123456Z",
      "0000-01-01T00:00:00.123456Z",
      "0000-12-31T23:59:59.999999Z",
    ]) {
      const res = await list(a, `?cursor=${enc(ts)}`);
      expect([ts, res.status, res.body.error?.code]).toEqual([ts, 422, "invalid_request"]);
    }
  });
});
