import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertDoc, insertLog } from "../../helpers/seed.js";

let ctx: Ctx, a: Tenant, b: Tenant, c: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ maxProjectsPerUser: 7, ratePerMinute: 1000, globalLlmCapPerMinute: 1000 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  c = await ctx.createTenant("c");
});
afterAll(async () => {
  await ctx.close();
});

const get = (t: Tenant) =>
  request(ctx.app).get("/api/dashboard/account").set("cookie", t.cookie);
const newProject = async (t: Tenant, name: string) => {
  const res = await request(ctx.app)
    .post("/api/dashboard/workspaces")
    .set("cookie", t.cookie)
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.workspace.id as string;
};

describe("GET /api/dashboard/account", () => {
  it("needs a session", async () => {
    expect((await request(ctx.app).get("/api/dashboard/account")).status).toBe(401);
  });

  it("returns the user, with email as the only credential provider and no secrets", async () => {
    await ctx.pool.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", password, "createdAt", "updatedAt")
       VALUES ($1, 'g-123', 'google', $2, 'AT-secret', 'RT-secret', 'IDT-secret', NULL, '2026-01-02T03:04:05Z', now())`,
      [randomUUID(), a.userId],
    );
    const res = await get(a);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["projects", "providers", "totals", "user"]);
    expect(Object.keys(res.body.user).sort()).toEqual(
      ["created_at", "email", "email_verified", "image", "name"].sort(),
    );
    expect(res.body.user).toMatchObject({ name: "a", email: a.email, email_verified: true });
    const providers = res.body.providers.map((p: { provider: string }) => p.provider).sort();
    expect(providers).toEqual(["email", "google"]);
    for (const p of res.body.providers) expect(Object.keys(p).sort()).toEqual(["linked_at", "provider"]);
    expect(res.body.providers.find((p: any) => p.provider === "google").linked_at).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    const text = JSON.stringify(res.body);
    for (const s of ["AT-secret", "RT-secret", "IDT-secret", "g-123", "scrypt", "correct-horse"])
      expect(text).not.toContain(s);
  });

  it("sums totals over all of the user's projects and counts owned ones; the cap comes from config", async () => {
    const p2 = await newProject(a, "second");
    const p3 = await newProject(a, "third");
    await insertDoc(ctx.pool, a.tenantId);
    await insertDoc(ctx.pool, p2);
    await insertDoc(ctx.pool, p2);
    await insertDoc(ctx.pool, p3);
    await insertLog(ctx.pool, a.tenantId);
    await insertLog(ctx.pool, p3);
    await insertLog(ctx.pool, p3, { createdAt: "2000-01-01T00:00:00Z" }); // not this month
    await ctx.seedModel(a, "cheap", "m1");
    await ctx.seedModel({ ...a, tenantId: p2 }, "cheap", "m2");
    await ctx.pool.query(
      `INSERT INTO apikey (id, "configId", "referenceId", key, "createdAt", "updatedAt") VALUES ($1, 'default', $2, $3, now(), now())`,
      [randomUUID(), p3, randomUUID()],
    );
    // a member (not owner) of b's project: its data counts in totals, but it is not "owned"
    await ctx.pool.query(
      `INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, 'member', now())`,
      [randomUUID(), b.tenantId, a.userId],
    );
    await insertDoc(ctx.pool, b.tenantId);
    await insertLog(ctx.pool, b.tenantId);
    // data of c, who shares nothing with a
    await insertDoc(ctx.pool, c.tenantId);
    await insertLog(ctx.pool, c.tenantId);
    await ctx.seedModel(c, "cheap", "mc");

    const res = await get(a);
    expect(res.body.projects).toEqual({ owned: 3, max: 7 });
    // docs: 1 + 2 + 1 + b's 1; requests: 1 + 1 + b's 1; keys: a's own + p3 + b's own; models: 1 + 1
    expect(res.body.totals).toEqual({
      documents: 5,
      requests_this_month: 3,
      api_keys: 3,
      models: 2,
    });
    const other = await get(c);
    expect(other.body.totals).toEqual({
      documents: 1,
      requests_this_month: 1,
      api_keys: 1,
      models: 1,
    });
    expect(other.body.projects).toEqual({ owned: 1, max: 7 });
    expect(other.body.user.email).toBe(c.email);
  });
});
