import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx } from "./helpers/ctx.js";

let ctx, a;
beforeAll(async () => {
  ctx = await makeCtx();
  a = await ctx.createTenant("a");
});
afterAll(async () => { await ctx.close(); });

const devKey = (app, secret, body) => {
  const req = request(app).post("/dev/api-key");
  if (secret) req.set("x-internal-secret", secret);
  return req.send(body);
};

describe("dev-only API key route", () => {
  it("mints an organization-owned key for an existing user that /v1 accepts", async () => {
    const res = await devKey(ctx.app, ctx.config.internalSecret, { email: a.email });
    expect(res.status).toBe(200);
    expect(res.body.tenant_id).toBe(a.tenantId);
    const used = await request(ctx.app).get("/v1/documents/00000000-0000-4000-8000-000000000000").set("x-api-key", res.body.api_key);
    expect(used.status).toBe(404); // authenticated, document just does not exist
  });

  it("needs the internal secret and an existing user", async () => {
    expect((await devKey(ctx.app, null, { email: a.email })).status).toBe(401);
    expect((await devKey(ctx.app, ctx.config.internalSecret, { email: "nobody@example.test" })).status).toBe(404);
  });

  it("is not mounted when NODE_ENV is production", async () => {
    const prod = await makeCtx({ production: true });
    try {
      const res = await devKey(prod.app, prod.config.internalSecret, { email: a.email });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    } finally { await prod.close(); }
  });
});
