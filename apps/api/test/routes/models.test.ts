import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { decryptSecret } from "../../src/lib/crypto.js";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";
import { startProviderStub } from "../helpers/providerStub.js";

let ctx: Ctx, a: Tenant, b: Tenant, provider: Awaited<ReturnType<typeof startProviderStub>>;
beforeAll(async () => {
  provider = await startProviderStub();
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000, maxRequestsPerMonth: 1000, modelTestTimeoutMs: 400 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => { provider.close(); await ctx.close(); });
afterEach(async () => {
  provider.reset();
  await ctx.pool.query("DELETE FROM tenant_models WHERE tenant_id = ANY($1)", [[a.tenantId, b.tenantId]]);
});

const as = (t: Tenant) => ({
  get: (path: string) => request(ctx.app).get(`/api/dashboard${path}`).set("cookie", t.cookie),
  post: (path: string, body: object) => request(ctx.app).post(`/api/dashboard${path}`).set("cookie", t.cookie).send(body),
});
const newModel = (over: object = {}) => ({
  provider: "openai_compatible", model_id: "small-1", endpoint_url: provider.url, api_key: provider.goodKey, tier: "cheap", ...over,
});
const rowsOf = (tenantId: string) => ctx.pool.query("SELECT * FROM tenant_models WHERE tenant_id = $1 ORDER BY tier, position", [tenantId]).then((r) => r.rows);

describe("auth", () => {
  it("every models endpoint answers 401 without a session", async () => {
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [method, path] of [["get", "/models"], ["post", "/models"], ["get", "/models/usage"], ["patch", `/models/${id}`], ["delete", `/models/${id}`]] as const) {
      const res = await request(ctx.app)[method](`/api/dashboard${path}`);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body.error.code).toBe("unauthorized");
    }
  });
});

describe("POST /api/dashboard/models (Test & save)", () => {
  it("tests the connection through the stored endpoint, saves the model encrypted and returns it with a masked key", async () => {
    const res = await as(a).post("/models", newModel());
    expect(res.status).toBe(201);
    expect(res.body.model).toMatchObject({ tier: "cheap", position: 0, provider: "openai_compatible", model_id: "small-1", endpoint_url: provider.url, key_hint: "sk-...1234", status: "connected" });
    expect(JSON.stringify(res.body)).not.toContain(provider.goodKey);
    expect(res.body.model.api_key).toBeUndefined();
    expect(res.body.model.api_key_encrypted).toBeUndefined();
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({ auth: `Bearer ${provider.goodKey}`, body: { model: "small-1" } });
    expect(provider.calls[0].body.max_tokens).toBeLessThanOrEqual(32); // one tiny completion
    const [row] = await rowsOf(a.tenantId);
    expect(row.api_key_encrypted).not.toContain(provider.goodKey);
    expect(decryptSecret(row.api_key_encrypted, ctx.config.modelKeySecret, a.tenantId)).toBe(provider.goodKey);
  });

  it("appends to the end of the tier; another tier starts at position 0", async () => {
    await as(a).post("/models", newModel({ model_id: "m0" }));
    await as(a).post("/models", newModel({ model_id: "m1" }));
    await as(a).post("/models", newModel({ model_id: "big", tier: "expensive" }));
    expect((await rowsOf(a.tenantId)).map((r) => [r.tier, r.position, r.model_id])).toEqual([
      ["cheap", 0, "m0"], ["cheap", 1, "m1"], ["expensive", 0, "big"]]);
  });

  it("takes the tenant from the session, never from the body", async () => {
    const res = await as(a).post("/models", newModel({ tenant_id: b.tenantId }));
    expect(res.status).toBe(201);
    expect(await rowsOf(b.tenantId)).toHaveLength(0);
    expect(await rowsOf(a.tenantId)).toHaveLength(1);
  });

  it("a rejected key fails Test & save, stores nothing and never echoes the key or the provider's message", async () => {
    const res = await as(a).post("/models", newModel({ api_key: "sk-wrong-key-9999" }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("model_test_failed");
    expect(res.body.error.message).toMatch(/key/i);
    expect(JSON.stringify(res.body)).not.toContain("sk-wrong-key-9999");
    expect(provider.calls).toHaveLength(1); // it did try
    expect(await rowsOf(a.tenantId)).toHaveLength(0);
  });

  it("fails and stores nothing when the endpoint times out or errors", async () => {
    provider.state.hang = true;
    let res = await as(a).post("/models", newModel());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("model_test_failed");
    provider.reset();
    provider.state.status = 500;
    res = await as(a).post("/models", newModel());
    expect(res.status).toBe(422);
    expect(await rowsOf(a.tenantId)).toHaveLength(0);
  });

  it.each([
    ["https://169.254.169.254/v1"], ["https://10.0.0.5/v1"], ["https://127.0.0.1/v1"], ["http://example.com/v1"], ["https://[::1]/v1"],
  ])("refuses endpoint %s with 422 invalid_endpoint, without calling it", async (endpoint_url) => {
    const res = await as(a).post("/models", newModel({ endpoint_url }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_endpoint");
    expect(await rowsOf(a.tenantId)).toHaveLength(0);
  });

  it("refuses http://localhost in production", async () => {
    const prod = await makeCtx({ production: true });
    try {
      const t = await prod.createTenant("p");
      const res = await request(prod.app).post("/api/dashboard/models").set("cookie", t.cookie).send(newModel());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("invalid_endpoint");
      expect(provider.calls).toHaveLength(0);
    } finally { await prod.close(); }
  });

  it.each([
    [{ provider: "mystery" }], [{ tier: "huge" }], [{ model_id: "" }], [{ api_key: "short" }], [{ endpoint_url: "" }], [{ api_key: undefined }],
  ])("rejects invalid body #%# with 422 invalid_request", async (over) => {
    const res = await as(a).post("/models", newModel(over));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_request");
    expect(provider.calls).toHaveLength(0);
  });
});

describe("GET /api/dashboard/models", () => {
  it("groups the tenant's models by tier in position order, with masked keys only", async () => {
    await as(a).post("/models", newModel({ model_id: "c0" }));
    await as(a).post("/models", newModel({ model_id: "c1" }));
    await as(a).post("/models", newModel({ model_id: "f0", tier: "fallback" }));
    const res = await as(a).get("/models");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.models)).toEqual(["cheap", "expensive", "fallback"]);
    expect(res.body.models.cheap.map((m: { model_id: string; position: number }) => [m.model_id, m.position])).toEqual([["c0", 0], ["c1", 1]]);
    expect(res.body.models.expensive).toEqual([]);
    expect(res.body.models.fallback[0]).toMatchObject({ model_id: "f0", key_hint: "sk-...1234", status: "connected", provider: "openai_compatible", endpoint_url: provider.url });
    expect(JSON.stringify(res.body)).not.toMatch(/api_key|encrypted|sk-good/);
  });

  it("never lists another tenant's models", async () => {
    await as(a).post("/models", newModel({ model_id: "mine" }));
    await as(b).post("/models", newModel({ model_id: "theirs" }));
    const res = await as(a).get("/models");
    expect(res.body.models.cheap.map((m: { model_id: string }) => m.model_id)).toEqual(["mine"]);
  });
});
