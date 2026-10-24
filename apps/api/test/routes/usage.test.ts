import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { createLimiters } from "../../src/shared/middleware/rateLimit.js";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";
import { insertLog } from "../helpers/seed.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ maxDocuments: 11, ratePerMinute: 22, maxRequestsPerMonth: 33, globalLlmCapPerMinute: 1000 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  await ctx.pool.query("INSERT INTO documents (tenant_id, filename) VALUES ($1, 'x.md'), ($1, 'y.md'), ($2, 'z.md')", [a.tenantId, b.tenantId]);
  await insertLog(ctx.pool, a.tenantId);
  await insertLog(ctx.pool, a.tenantId);
  await insertLog(ctx.pool, a.tenantId, { createdAt: "2000-01-15T00:00:00Z" }); // an old month does not count
  await insertLog(ctx.pool, b.tenantId);
});
afterAll(async () => { await ctx.close(); });

const usage = (t?: Tenant) => { const r = request(ctx.app).get("/api/dashboard/usage"); return t ? r.set("cookie", t.cookie) : r; };

describe("GET /api/dashboard/usage", () => {
  it("needs a session", async () => {
    const res = await usage();
    expect([res.status, res.body.error.code]).toEqual([401, "unauthorized"]);
  });

  it("returns used and max for documents, requests per minute and requests this month, with max from the config", async () => {
    const res = await usage(a);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      documents: { used: 2, max: 11 },
      requests_per_minute: { used: 0, max: 22 },
      requests_this_month: { used: 2, max: 33 },
    });
  });

  it("requests_per_minute.used reads the counter shared by /v1/chat and /api/dashboard/try, per tenant", async () => {
    await request(ctx.app).post("/v1/chat").set("x-api-key", a.apiKey).send({ query: "q" });
    await request(ctx.app).post("/v1/chat").set("x-api-key", a.apiKey).send({ query: "q" });
    await request(ctx.app).post("/api/dashboard/try").set("cookie", a.cookie).send({ query: "q" });
    expect((await usage(a)).body.requests_per_minute.used).toBe(3);
    expect((await usage(b)).body.requests_per_minute.used).toBe(0);
    expect((await usage(a)).body.requests_this_month.used).toBe(5); // 2 seeded + 3 live
  });

  it("tenant B sees only its own counts", async () => {
    expect((await usage(b)).body).toMatchObject({ documents: { used: 1 }, requests_this_month: { used: 1 } });
  });
});

describe("rate limiter usage reader", () => {
  it("reports 0 once the window has ended, even if the store still holds the old entry", async () => {
    const limiters = createLimiters({ ratePerMinute: 5, globalLlmCapPerMinute: 5 });
    const app = express();
    app.use((req, _res, next) => { req.tenantId = "t"; next(); });
    app.get("/", limiters.perTenant, (_req, res) => { res.end(); });
    await request(app).get("/");
    expect(await limiters.used("t")).toBe(1);
    const real = Date.now;
    Date.now = () => real() + 61_000;
    try { expect(await limiters.used("t")).toBe(0); } finally { Date.now = real; }
  });
});
