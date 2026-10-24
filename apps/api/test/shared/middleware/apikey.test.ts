import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx();
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

const insertDoc = async (tenantId: string, filename = "handbook.md") =>
  (
    await ctx.pool.query(
      `INSERT INTO documents (tenant_id, filename, status, chunk_count) VALUES ($1, $2, 'ready', 3) RETURNING id`,
      [tenantId, filename],
    )
  ).rows[0].id;

describe("requireApiKey on /v1/*", () => {
  const routes: ["get" | "delete" | "post", string][] = [
    ["get", `/v1/documents/${randomUUID()}`],
    ["delete", `/v1/documents/${randomUUID()}`],
    ["post", "/v1/documents"],
    ["post", "/v1/chat"],
    ["post", "/v1/feedback"],
  ];

  it.each(routes)("%s %s without a key returns 401 invalid_api_key", async (method, path) => {
    const res = await request(ctx.app)[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "invalid_api_key", message: expect.any(String) } });
  });

  it.each(routes)("%s %s with a bad key returns 401 invalid_api_key", async (method, path) => {
    const res = await request(ctx.app)[method](path).set("x-api-key", "lumen_not_a_real_key");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_api_key");
  });

  it("a valid key is accepted and reads its own tenant's document", async () => {
    const id = await insertDoc(a.tenantId);
    const res = await request(ctx.app).get(`/v1/documents/${id}`).set("x-api-key", a.apiKey);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ document_id: id, status: "ready", chunk_count: 3, error: null });
  });
});

describe("tenant isolation for documents", () => {
  it("tenant A asking for tenant B's document id gets 404 not_found, not 403", async () => {
    const bDoc = await insertDoc(b.tenantId);
    const res = await request(ctx.app).get(`/v1/documents/${bDoc}`).set("x-api-key", a.apiKey);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("an unknown id and a malformed id both return the same 404", async () => {
    for (const id of [randomUUID(), "not-a-uuid"]) {
      const res = await request(ctx.app).get(`/v1/documents/${id}`).set("x-api-key", a.apiKey);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });
});
