import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";
import { insertLog } from "../helpers/seed.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => { ctx = await makeCtx(); a = await ctx.createTenant("a"); b = await ctx.createTenant("b"); });
afterAll(async () => { await ctx.close(); });

const send = (t: Tenant | null, body: object) => { const r = request(ctx.app).post("/api/dashboard/feedback").send(body); return t ? r.set("cookie", t.cookie) : r; };
const feedbackOf = async (id: string) => (await ctx.pool.query("SELECT feedback FROM request_logs WHERE id = $1", [id])).rows[0].feedback;

describe("POST /api/dashboard/feedback (Try it 'Helpful?')", () => {
  it("needs a session", async () => {
    const id = await insertLog(ctx.pool, a.tenantId);
    expect((await send(null, { request_id: id, rating: 1 })).status).toBe(401);
    expect(await feedbackOf(id)).toBeNull();
  });

  it("stores 1 or -1 on the tenant's own request and answers 204", async () => {
    const id = await insertLog(ctx.pool, a.tenantId);
    expect((await send(a, { request_id: id, rating: 1 })).status).toBe(204);
    expect(await feedbackOf(id)).toBe(1);
    expect((await send(a, { request_id: id, rating: -1 })).status).toBe(204);
    expect(await feedbackOf(id)).toBe(-1);
  });

  it("answers 404 not_found for another tenant's request and leaves it unchanged", async () => {
    const theirs = await insertLog(ctx.pool, b.tenantId);
    const res = await send(a, { request_id: theirs, rating: -1 });
    expect([res.status, res.body.error.code]).toEqual([404, "not_found"]);
    expect(await feedbackOf(theirs)).toBeNull();
    expect((await send(a, { request_id: randomUUID(), rating: 1 })).status).toBe(404);
  });

  it.each([{ request_id: "nope", rating: 1 }, { rating: 1 }, { request_id: randomUUID(), rating: 5 }, { request_id: randomUUID() }])("rejects %j with 422", async (body) => {
    const res = await send(a, body);
    expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
  });
});
