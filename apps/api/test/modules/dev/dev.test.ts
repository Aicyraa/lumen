import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/shared/config/config.js";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ devRoutes: true });
  a = await ctx.createTenant("a");
});
afterAll(async () => {
  await ctx.close();
});

const devKey = (app: Ctx["app"], secret: string | null, body: object) => {
  const req = request(app).post("/dev/api-key");
  if (secret) req.set("x-internal-secret", secret);
  return req.send(body);
};

describe("dev-only API key route", () => {
  it.each([
    ["development", true],
    ["production", false],
    ["test", false],
    ["staging", false],
  ])(
    "NODE_ENV=%s mounts it: %s (explicit opt-in)",
    (nodeEnv: string | undefined, mounted: boolean) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: "postgresql://x/y",
        RAG_SERVICE_URL: "http://x",
        SMTP_URL: "smtp://x",
        MAIL_FROM: "a@b.test",
      };
      if (nodeEnv) env.NODE_ENV = nodeEnv;
      else delete env.NODE_ENV;
      expect(loadConfig(env).devRoutes).toBe(mounted);
    },
  );

  it("mints an organization-owned key for an existing user that /v1 accepts", async () => {
    const res = await devKey(ctx.app, ctx.config.internalSecret, { email: a.email });
    expect(res.status).toBe(200);
    expect(res.body.tenant_id).toBe(a.tenantId);
    const used = await request(ctx.app)
      .get("/v1/documents/00000000-0000-4000-8000-000000000000")
      .set("x-api-key", res.body.api_key);
    expect(used.status).toBe(404); // authenticated, document just does not exist
  });

  it("needs the internal secret and an existing user", async () => {
    expect((await devKey(ctx.app, null, { email: a.email })).status).toBe(401);
    expect(
      (await devKey(ctx.app, ctx.config.internalSecret, { email: "nobody@example.test" })).status,
    ).toBe(404);
  });

  it("is not mounted unless devRoutes is on", async () => {
    const prod = await makeCtx({ devRoutes: false });
    try {
      const res = await devKey(prod.app, prod.config.internalSecret, { email: a.email });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    } finally {
      await prod.close();
    }
  });
});

describe("dev-only verify-email route (for e2e runs: sign up with email + password, then verify without a mailbox)", () => {
  const devVerify = (app: Ctx["app"], secret: string | null, body: object) => {
    const req = request(app).post("/dev/verify-email");
    if (secret) req.set("x-internal-secret", secret);
    return req.send(body);
  };
  const signUp = (email: string) =>
    request(ctx.app)
      .post("/api/auth/sign-up/email")
      .set("origin", ctx.config.dashboardOrigin)
      .send({ email, password: "correct-horse-battery", name: "E2E" });
  const signIn = (email: string) =>
    request(ctx.app)
      .post("/api/auth/sign-in/email")
      .set("origin", ctx.config.dashboardOrigin)
      .send({ email, password: "correct-horse-battery" });

  it("marks the user's email verified so password sign-in works, and keeps /dev/api-key working for that user", async () => {
    const email = `e2e-${Date.now()}@example.test`;
    await signUp(email);
    expect((await signIn(email)).status).toBe(403);
    const res = await devVerify(ctx.app, ctx.config.internalSecret, { email });
    expect(res.status).toBe(204);
    expect((await signIn(email)).status).toBe(200);
    expect((await devKey(ctx.app, ctx.config.internalSecret, { email })).status).toBe(200);
  });

  it("needs the internal secret and an existing user, and is not mounted unless devRoutes is on", async () => {
    expect((await devVerify(ctx.app, null, { email: a.email })).status).toBe(401);
    expect(
      (await devVerify(ctx.app, ctx.config.internalSecret, { email: "nobody@example.test" }))
        .status,
    ).toBe(404);
    const prod = await makeCtx({ devRoutes: false });
    try {
      expect(
        (await devVerify(prod.app, prod.config.internalSecret, { email: a.email })).status,
      ).toBe(404);
    } finally {
      await prod.close();
    }
  });
});
