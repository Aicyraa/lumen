import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertDoc } from "../../helpers/seed.js";

// X-Project-Id: the dashboard says which project it believes is active; if the session's active project differs, nothing is touched.
let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

const origin = () => ctx.config.dashboardOrigin;
const withHeader = (req: request.Test, t: Tenant, project?: string) => {
  req.set("cookie", t.cookie).set("origin", origin());
  return project === undefined ? req : req.set("x-project-id", project);
};
const GETS = [
  "/api/dashboard/documents",
  "/api/dashboard/models",
  "/api/dashboard/models/usage",
  "/api/dashboard/requests",
  "/api/dashboard/analytics/summary",
  "/api/dashboard/analytics/unanswered",
  "/api/dashboard/usage",
];

describe("X-Project-Id on dashboard routes", () => {
  it.each(GETS)("%s: a header naming another project is 409 project_mismatch", async (path) => {
    const res = await withHeader(request(ctx.app).get(path), a, b.tenantId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "project_mismatch", message: expect.any(String) } });
  });

  it.each(GETS)("%s: the active project's id, or no header, works as before", async (path) => {
    expect((await withHeader(request(ctx.app).get(path), a, a.tenantId)).status).toBe(200);
    expect((await withHeader(request(ctx.app).get(path), a)).status).toBe(200);
  });

  it("a mismatch changes nothing: no upload, no model, no delete, no chat", async () => {
    const doc = await insertDoc(ctx.pool, a.tenantId, 0);
    const before = (
      await ctx.pool.query("SELECT count(*)::int n FROM documents WHERE tenant_id = $1", [
        a.tenantId,
      ])
    ).rows[0].n;
    const up = await withHeader(
      request(ctx.app).post("/api/dashboard/documents"),
      a,
      b.tenantId,
    ).attach("file", Buffer.from("x"), "x.md");
    expect(up.status).toBe(409);
    const del = await withHeader(
      request(ctx.app).delete(`/api/dashboard/documents/${doc}`),
      a,
      b.tenantId,
    );
    expect(del.status).toBe(409);
    const model = await withHeader(
      request(ctx.app).post("/api/dashboard/models"),
      a,
      b.tenantId,
    ).send({});
    expect(model.status).toBe(409); // before validation: it never reached the handler
    const tryIt = await withHeader(request(ctx.app).post("/api/dashboard/try"), a, b.tenantId).send(
      { query: "q" },
    );
    expect(tryIt.status).toBe(409);
    const after = (
      await ctx.pool.query("SELECT count(*)::int n FROM documents WHERE tenant_id = $1", [
        a.tenantId,
      ])
    ).rows[0].n;
    expect(after).toBe(before);
    expect((await ctx.pool.query("SELECT 1 FROM documents WHERE id = $1", [doc])).rowCount).toBe(1);
    expect(
      (await ctx.pool.query("SELECT 1 FROM request_logs WHERE tenant_id = $1", [a.tenantId]))
        .rowCount,
    ).toBe(0);
  });

  it("API key routes (Better Auth) check the header too, before any key is touched", async () => {
    const list = (t: Tenant, project?: string) =>
      withHeader(
        request(ctx.app).get(`/api/auth/api-key/list?organizationId=${t.tenantId}`),
        t,
        project,
      );
    expect((await list(a, b.tenantId)).status).toBe(409);
    expect((await list(a, b.tenantId)).body.error.code).toBe("project_mismatch");
    expect((await list(a, a.tenantId)).status).toBe(200);
    expect((await list(a)).status).toBe(200);
    const created = await withHeader(
      request(ctx.app).post("/api/auth/api-key/create"),
      a,
      b.tenantId,
    ).send({ name: "k", organizationId: a.tenantId });
    expect(created.status).toBe(409);
    expect(
      (
        await ctx.pool.query(`SELECT 1 FROM apikey WHERE name = 'k' AND "referenceId" = $1`, [
          a.tenantId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("routes that need no active project (workspaces, account) ignore the header", async () => {
    const res = await withHeader(request(ctx.app).get("/api/dashboard/workspaces"), a, b.tenantId);
    expect(res.status).toBe(200);
  });

  it("the CORS preflight allows the X-Project-Id header", async () => {
    const res = await request(ctx.app)
      .options("/api/dashboard/documents")
      .set("origin", origin())
      .set("access-control-request-method", "GET")
      .set("access-control-request-headers", "x-project-id");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-headers"]?.toLowerCase()).toContain("x-project-id");
  });
});
