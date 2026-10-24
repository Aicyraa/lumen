import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";

// 12 concurrent requests are more than the pool's 10 connections: a handler that holds a connection while Better Auth
// needs more would deadlock the whole API. The short connection timeout turns any such starvation into errors, not a hang.
const CAP = 4;
// Each test gets its own app and pool, so a stuck request in one cannot starve the next.
let ctx: Ctx;
beforeEach(async () => { ctx = await makeCtx({ maxProjectsPerUser: CAP, dbConnectionTimeoutMs: 3000, ratePerMinute: 1000, globalLlmCapPerMinute: 1000 }); });
afterEach(async () => { await ctx.close(); });

const origin = () => ctx.config.dashboardOrigin;
const viaWorkspaces = (t: Tenant, name: string) => request(ctx.app).post("/api/dashboard/workspaces").set("cookie", t.cookie).send({ name });
const viaBetterAuth = (t: Tenant) => request(ctx.app).post("/api/auth/organization/create").set("origin", origin()).set("cookie", t.cookie)
  .send({ name: "direct", slug: `direct-${randomUUID().slice(0, 8)}` });
const owned = async (t: Tenant) => (await ctx.pool.query(`SELECT count(*)::int AS n FROM member WHERE "userId" = $1 AND role = 'owner'`, [t.userId])).rows[0].n;

describe("creating projects concurrently", () => {
  it("12 concurrent creates by one user finish: exactly the cap succeeds, the rest are 422 project_limit, and the pool survives", async () => {
    const u = await ctx.createTenant("burst"); // owns 1 already
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => viaWorkspaces(u, `burst ${i}`)));
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(results.filter((r) => r.status === 201)).toHaveLength(CAP - 1);
    const refused = results.filter((r) => r.status !== 201);
    expect(refused.map((r) => [r.status, r.body.error?.code])).toEqual(refused.map(() => [422, "project_limit"]));
    expect(await owned(u)).toBe(CAP);
    expect((await viaWorkspaces(await ctx.createTenant("after"), "still works")).status).toBe(201);
  });

  it("other routes keep answering while one user floods project creation", async () => {
    const flooder = await ctx.createTenant("flood");
    const other = await ctx.createTenant("bystander");
    const flood = Promise.all(Array.from({ length: 12 }, (_, i) => viaWorkspaces(flooder, `flood ${i}`)));
    const started = Date.now();
    const meanwhile = await Promise.all(["/workspaces", "/usage", "/documents", "/requests"].flatMap((p) =>
      [1, 2, 3].map(() => request(ctx.app).get(`/api/dashboard${p}`).set("cookie", other.cookie))));
    expect(meanwhile.map((r) => r.status)).toEqual(meanwhile.map(() => 200));
    expect(Date.now() - started).toBeLessThan(8_000);
    await flood;
  });

  it("8 concurrent calls to the Better Auth endpoint cannot exceed the cap", async () => {
    const u = await ctx.createTenant("direct");
    const results = await Promise.all(Array.from({ length: 8 }, () => viaBetterAuth(u)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(CAP - 1);
    const refused = results.filter((r) => r.status !== 200);
    expect(refused.every((r) => r.body.code === "PROJECT_LIMIT")).toBe(true);
    expect(await owned(u)).toBe(CAP);
  });

  it("the Better Auth endpoint and /workspaces share one cap when called at the same time", async () => {
    const u = await ctx.createTenant("mixed");
    const calls = [...Array.from({ length: 5 }, () => viaBetterAuth(u)), ...Array.from({ length: 5 }, (_, i) => viaWorkspaces(u, `mixed ${i}`))];
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.status === 200 || r.status === 201)).toHaveLength(CAP - 1);
    expect(await owned(u)).toBe(CAP);
  });
});
