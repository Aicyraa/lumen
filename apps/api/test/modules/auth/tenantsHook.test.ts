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
});
