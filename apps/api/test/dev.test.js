import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { loadConfig } from "../src/config.js";
import { makeCtx } from "./helpers/ctx.js";

let ctx, a;
beforeAll(async () => {
  ctx = await makeCtx({ devRoutes: true });
  a = await ctx.createTenant("a");
});
afterAll(async () => { await ctx.close(); });

const devKey = (app, secret, body) => {
  const req = request(app).post("/dev/api-key");
  if (secret) req.set("x-internal-secret", secret);
  return req.send(body);
};

describe("dev-only API key route", () => {
  it.each([["development", true], ["production", false], ["test", false], ["staging", false], [undefined, false]])(
    "NODE_ENV=%s mounts it: %s (explicit opt-in)", (nodeEnv, mounted) => {
      const env = { ...process.env, DATABASE_URL: "postgresql://x/y", RAG_SERVICE_URL: "http://x" };
      if (nodeEnv) env.NODE_ENV = nodeEnv; else delete env.NODE_ENV;
      expect(loadConfig(env).devRoutes).toBe(mounted);
    });

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

  it("is not mounted unless devRoutes is on", async () => {
    const prod = await makeCtx({ devRoutes: false });
    try {
      const res = await devKey(prod.app, prod.config.internalSecret, { email: a.email });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    } finally { await prod.close(); }
  });
});
