import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { startProviderStub } from "../../helpers/providerStub.js";

// A cap on models per tier, and a tight limiter on Test & save (it calls the tenant's provider).
let ctx: Ctx, a: Tenant, b: Tenant, provider: Awaited<ReturnType<typeof startProviderStub>>;
beforeAll(async () => {
  provider = await startProviderStub();
  ctx = await makeCtx({
    ratePerMinute: 1000,
    globalLlmCapPerMinute: 1000,
    maxModelsPerTier: 2,
    modelTestRatePerMinute: 4,
  });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  provider.close();
  await ctx.close();
});
afterEach(async () => {
  provider.reset();
  await ctx.pool.query("DELETE FROM tenant_models WHERE tenant_id = ANY($1)", [
    [a.tenantId, b.tenantId],
  ]);
});

const add = (t: Tenant, over: object = {}) =>
  request(ctx.app)
    .post("/api/dashboard/models")
    .set("cookie", t.cookie)
    .send({
      provider: "openai_compatible",
      model_id: "m",
      endpoint_url: provider.url,
      api_key: provider.goodKey,
      tier: "cheap",
      ...over,
    });
const count = async (t: Tenant, tier: string) =>
  (
    await ctx.pool.query(
      "SELECT count(*)::int AS n FROM tenant_models WHERE tenant_id = $1 AND tier = $2",
      [t.tenantId, tier],
    )
  ).rows[0].n;

describe("models per tier", () => {
  it("answers 422 model_limit past MAX_MODELS_PER_TIER, before calling the provider, per tier and per tenant", async () => {
    expect((await add(a)).status).toBe(201);
    expect((await add(a)).status).toBe(201);
    provider.calls.length = 0;
    const over = await add(a);
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("model_limit");
    expect(provider.calls).toHaveLength(0);
    expect(await count(a, "cheap")).toBe(2);
    expect((await add(a, { tier: "expensive" })).status).toBe(201); // the cap is per tier
    expect((await add(b)).status).toBe(201); // and per tenant
  });

  it("holds under concurrent adds (the check is repeated inside the locked transaction)", async () => {
    await add(a);
    const results = await Promise.all([add(a), add(a), add(a)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422]);
    expect(await count(a, "cheap")).toBe(2);
  });
});

describe("Test & save rate limit", () => {
  it("answers 429 rate_limited after MODEL_TEST_RATE_PER_MINUTE attempts per tenant, without calling the provider", async () => {
    // fresh app so earlier tests' attempts are not counted
    const fresh = await makeCtx({
      ratePerMinute: 1000,
      globalLlmCapPerMinute: 1000,
      modelTestRatePerMinute: 3,
      maxModelsPerTier: 50,
    });
    try {
      const t = await fresh.createTenant("rl");
      const other = await fresh.createTenant("rl2");
      const post = (x: Tenant) =>
        request(fresh.app).post("/api/dashboard/models").set("cookie", x.cookie).send({
          provider: "openai_compatible",
          model_id: "m",
          endpoint_url: provider.url,
          api_key: provider.goodKey,
          tier: "cheap",
        });
      provider.calls.length = 0;
      for (let i = 0; i < 3; i++) expect((await post(t)).status).toBe(201);
      const limited = await post(t);
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe("rate_limited");
      expect(limited.headers["retry-after"] ?? limited.headers["ratelimit"]).toBeDefined();
      expect(provider.calls).toHaveLength(3);
      expect((await post(other)).status).toBe(201); // another tenant has its own counter
      const list = await request(fresh.app).get("/api/dashboard/models").set("cookie", t.cookie);
      expect(list.status).toBe(200); // reading the list is not limited
    } finally {
      await fresh.close();
    }
  });
});
