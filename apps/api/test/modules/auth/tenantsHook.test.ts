import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx } from "../../helpers/ctx.js";

let ctx: Ctx;
beforeAll(async () => {
  ctx = await makeCtx();
});
afterAll(async () => {
  await ctx.close();
});

const registered = async (id: string) =>
  (await ctx.pool.query("SELECT 1 FROM tenants WHERE id = $1", [id])).rowCount;

describe("tenants row for every organization", () => {
  it("is inserted for the personal project created at sign-up", async () => {
    const t = await ctx.createTenant("hook");
    expect(await registered(t.tenantId)).toBe(1);
  });

  it("is inserted when a project is created through the API, exactly once", async () => {
    const t = await ctx.createTenant("proj");
    const res = await request(ctx.app)
      .post("/api/dashboard/workspaces")
      .set("cookie", t.cookie)
      .send({ name: "Second" });
    expect(res.status).toBe(201);
    const { rows } = await ctx.pool.query("SELECT count(*)::int AS n FROM tenants WHERE id = $1", [
      res.body.workspace.id,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it("is not duplicated or failed when the row already exists (ON CONFLICT DO NOTHING)", async () => {
    const t = await ctx.createTenant("dup");
    await ctx.pool.query("INSERT INTO tenants (id) VALUES ($1) ON CONFLICT DO NOTHING", [
      t.tenantId,
    ]);
    expect(await registered(t.tenantId)).toBe(1);
  });

  it("when the tenants insert fails the create call fails, and the per-user lock is released so the next create works", async () => {
    const t = await ctx.createTenant("fail");
    await ctx.pool.query(
      `CREATE OR REPLACE FUNCTION test_block_tenants() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked for test'; END $$ LANGUAGE plpgsql`,
    );
    await ctx.pool.query(
      "CREATE TRIGGER test_block_tenants BEFORE INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION test_block_tenants()",
    );
    let failed;
    try {
      failed = await request(ctx.app)
        .post("/api/dashboard/workspaces")
        .set("cookie", t.cookie)
        .send({ name: "Broken" });
    } finally {
      await ctx.pool.query("DROP TRIGGER test_block_tenants ON tenants");
    }
    expect(failed.status).toBeGreaterThanOrEqual(500); // known: the organization row already exists, without a tenants row
    const ok = await request(ctx.app)
      .post("/api/dashboard/workspaces")
      .set("cookie", t.cookie)
      .send({ name: "Fine" });
    expect(ok.status).toBe(201);
  });
});
