import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertDoc, insertLog } from "../../helpers/seed.js";

// Every dashboard route that takes an id: tenant A asking for tenant B's id gets 404 not_found (never 403), and nothing changes.
let ctx: Ctx, a: Tenant, b: Tenant, docB: string, reqB: string, modelB: string;
beforeAll(async () => {
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  docB = await insertDoc(ctx.pool, b.tenantId, 1);
  reqB = await insertLog(ctx.pool, b.tenantId);
  modelB = await ctx.seedModel(b, "cheap", "b-model");
});
afterAll(async () => {
  await ctx.close();
});

const asA = (method: "get" | "post" | "patch" | "delete", path: string) =>
  request(ctx.app)[method](`/api/dashboard${path}`).set("cookie", a.cookie);
const count = async (sql: string, id: string) => (await ctx.pool.query(sql, [id])).rows[0].n;

describe("another tenant's ids on dashboard routes", () => {
  const cases: [string, "get" | "post" | "patch" | "delete", () => string, (() => object)?][] = [
    ["GET /documents/:id", "get", () => `/documents/${docB}`],
    ["DELETE /documents/:id", "delete", () => `/documents/${docB}`],
    ["GET /requests/:id", "get", () => `/requests/${reqB}`],
    ["PATCH /models/:id", "patch", () => `/models/${modelB}`, () => ({ direction: "down" })],
    ["DELETE /models/:id", "delete", () => `/models/${modelB}`],
    ["POST /feedback", "post", () => "/feedback", () => ({ request_id: reqB, rating: 1 })],
  ];
  it.each(cases)("%s answers 404 not_found", async (_name, method, path, body) => {
    const res = await asA(method, path()).send(body?.());
    expect([res.status, res.body.error?.code]).toEqual([404, "not_found"]);
  });

  it("and none of them changed B's data", async () => {
    expect(await count("SELECT count(*)::int n FROM documents WHERE id = $1", docB)).toBe(1);
    expect(await count("SELECT count(*)::int n FROM chunks WHERE document_id = $1", docB)).toBe(1);
    expect(await count("SELECT count(*)::int n FROM tenant_models WHERE id = $1", modelB)).toBe(1);
    expect(await count("SELECT count(feedback)::int n FROM request_logs WHERE id = $1", reqB)).toBe(
      0,
    );
  });

  it("B itself can read them (so the 404 above is about the tenant, not a broken route)", async () => {
    const asB = (path: string) =>
      request(ctx.app).get(`/api/dashboard${path}`).set("cookie", b.cookie);
    expect((await asB(`/documents/${docB}`)).status).toBe(200);
    expect((await asB(`/requests/${reqB}`)).status).toBe(200);
  });
});
