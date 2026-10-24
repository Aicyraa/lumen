import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { decryptSecret } from "../../../src/shared/lib/crypto.js";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { startProviderStub } from "../../helpers/providerStub.js";

let ctx: Ctx, a: Tenant, b: Tenant, provider: Awaited<ReturnType<typeof startProviderStub>>;
beforeAll(async () => {
  provider = await startProviderStub();
  ctx = await makeCtx({
    ratePerMinute: 1000,
    globalLlmCapPerMinute: 1000,
    maxRequestsPerMonth: 1000,
    modelTestTimeoutMs: 400,
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

const as = (t: Tenant) => ({
  get: (path: string) => request(ctx.app).get(`/api/dashboard${path}`).set("cookie", t.cookie),
  post: (path: string, body: object) =>
    request(ctx.app).post(`/api/dashboard${path}`).set("cookie", t.cookie).send(body),
});
const newModel = (over: object = {}) => ({
  provider: "openai_compatible",
  model_id: "small-1",
  endpoint_url: provider.url,
  api_key: provider.goodKey,
  tier: "cheap",
  ...over,
});
const rowsOf = (tenantId: string) =>
  ctx.pool
    .query("SELECT * FROM tenant_models WHERE tenant_id = $1 ORDER BY tier, position", [tenantId])
    .then((r) => r.rows);

describe("auth", () => {
  it("every models endpoint answers 401 without a session", async () => {
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [method, path] of [
      ["get", "/models"],
      ["post", "/models"],
      ["get", "/models/usage"],
      ["patch", `/models/${id}`],
      ["delete", `/models/${id}`],
    ] as const) {
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
    expect(res.body.model).toMatchObject({
      tier: "cheap",
      position: 0,
      provider: "openai_compatible",
      model_id: "small-1",
      endpoint_url: provider.url,
      key_hint: "sk-...1234",
      status: "connected",
    });
    expect(JSON.stringify(res.body)).not.toContain(provider.goodKey);
    expect(res.body.model.api_key).toBeUndefined();
    expect(res.body.model.api_key_encrypted).toBeUndefined();
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({
      auth: `Bearer ${provider.goodKey}`,
      body: { model: "small-1" },
    });
    expect(provider.calls[0].body.max_tokens).toBeLessThanOrEqual(32); // one tiny completion
    const [row] = await rowsOf(a.tenantId);
    expect(row.api_key_encrypted).not.toContain(provider.goodKey);
    expect(decryptSecret(row.api_key_encrypted, ctx.config.modelKeySecret, a.tenantId)).toBe(
      provider.goodKey,
    );
  });

  it("appends to the end of the tier; another tier starts at position 0", async () => {
    await as(a).post("/models", newModel({ model_id: "m0" }));
    await as(a).post("/models", newModel({ model_id: "m1" }));
    await as(a).post("/models", newModel({ model_id: "big", tier: "expensive" }));
    expect((await rowsOf(a.tenantId)).map((r) => [r.tier, r.position, r.model_id])).toEqual([
      ["cheap", 0, "m0"],
      ["cheap", 1, "m1"],
      ["expensive", 0, "big"],
    ]);
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
    ["https://169.254.169.254/v1"],
    ["https://10.0.0.5/v1"],
    ["https://127.0.0.1/v1"],
    ["http://example.com/v1"],
    ["https://[::1]/v1"],
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
      const res = await request(prod.app)
        .post("/api/dashboard/models")
        .set("cookie", t.cookie)
        .send(newModel());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("invalid_endpoint");
      expect(provider.calls).toHaveLength(0);
    } finally {
      await prod.close();
    }
  });

  it.each([
    [{ provider: "mystery" }],
    [{ tier: "huge" }],
    [{ tier: "fallback" }], // the fallback tier was removed
    [{ model_id: "" }],
    [{ api_key: "short" }],
    [{ endpoint_url: "" }],
    [{ api_key: undefined }],
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
    await as(a).post("/models", newModel({ model_id: "e0", tier: "expensive" }));
    const res = await as(a).get("/models");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.models)).toEqual(["cheap", "expensive"]);
    expect(
      res.body.models.cheap.map((m: { model_id: string; position: number }) => [
        m.model_id,
        m.position,
      ]),
    ).toEqual([
      ["c0", 0],
      ["c1", 1],
    ]);
    expect(res.body.models.expensive[0]).toMatchObject({
      model_id: "e0",
      key_hint: "sk-...1234",
      status: "connected",
      provider: "openai_compatible",
      endpoint_url: provider.url,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/api_key|encrypted|sk-good/);
  });

  it("never lists another tenant's models", async () => {
    await as(a).post("/models", newModel({ model_id: "mine" }));
    await as(b).post("/models", newModel({ model_id: "theirs" }));
    const res = await as(a).get("/models");
    expect(res.body.models.cheap.map((m: { model_id: string }) => m.model_id)).toEqual(["mine"]);
  });
});

describe("PATCH and DELETE /api/dashboard/models/:id", () => {
  const seed = async (t: Tenant, tier: string, names: string[]) => {
    const ids: string[] = [];
    for (const model_id of names)
      ids.push((await as(t).post("/models", newModel({ tier, model_id }))).body.model.id);
    return ids;
  };
  const patch = (t: Tenant, id: string, body: object) =>
    request(ctx.app).patch(`/api/dashboard/models/${id}`).set("cookie", t.cookie).send(body);
  const del = (t: Tenant, id: string) =>
    request(ctx.app).delete(`/api/dashboard/models/${id}`).set("cookie", t.cookie);
  const order = async (t: Tenant, tier: string) =>
    (await rowsOf(t.tenantId))
      .filter((r) => r.tier === tier)
      .map((r) => `${r.position}:${r.model_id}`);

  it("moves a model down and up by swapping with its neighbour inside its tier, keeping positions unique", async () => {
    const [m0, m1, m2] = await seed(a, "cheap", ["m0", "m1", "m2"]);
    await seed(a, "expensive", ["e0"]);
    let res = await patch(a, m0, { direction: "down" });
    expect(res.status).toBe(200);
    expect(await order(a, "cheap")).toEqual(["0:m1", "1:m0", "2:m2"]);
    expect(res.body.models.cheap.map((m: { model_id: string }) => m.model_id)).toEqual([
      "m1",
      "m0",
      "m2",
    ]);
    res = await patch(a, m2, { direction: "up" });
    expect(await order(a, "cheap")).toEqual(["0:m1", "1:m2", "2:m0"]);
    expect(await order(a, "expensive")).toEqual(["0:e0"]);
    expect(m1).toBeTruthy();
  });

  it("moving the first model up or the last model down changes nothing", async () => {
    const [m0, m1] = await seed(a, "cheap", ["m0", "m1"]);
    expect((await patch(a, m0, { direction: "up" })).status).toBe(200);
    expect((await patch(a, m1, { direction: "down" })).status).toBe(200);
    expect(await order(a, "cheap")).toEqual(["0:m0", "1:m1"]);
  });

  it.each([[{}], [{ direction: "sideways" }], [{ direction: 1 }]])(
    "rejects invalid move body #%# with 422",
    async (body) => {
      const [m0] = await seed(a, "cheap", ["m0"]);
      expect((await patch(a, m0, body)).status).toBe(422);
    },
  );

  it("deletes a model and closes the gap in the order", async () => {
    const [, m1] = await seed(a, "cheap", ["m0", "m1", "m2", "m3"]);
    expect((await del(a, m1)).status).toBe(204);
    expect(await order(a, "cheap")).toEqual(["0:m0", "1:m2", "2:m3"]);
  });

  it("tenant B gets 404 not_found for tenant A's model id on PATCH and DELETE, and nothing changes", async () => {
    const [m0, m1] = await seed(a, "cheap", ["m0", "m1"]);
    const before = await order(a, "cheap");
    for (const res of [await patch(b, m0, { direction: "down" }), await del(b, m1)]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
    expect(await order(a, "cheap")).toEqual(before);
    expect((await patch(a, m0, { direction: "down" })).status).toBe(200); // the owner still can
  });

  it("a deletion by tenant B does not shift tenant A's positions in the same tier name", async () => {
    await seed(a, "cheap", ["a0", "a1"]);
    const [b0] = await seed(b, "cheap", ["b0", "b1"]);
    await del(b, b0);
    expect(await order(a, "cheap")).toEqual(["0:a0", "1:a1"]);
    expect(await order(b, "cheap")).toEqual(["0:b1"]);
  });

  it.each(["not-a-uuid", "00000000-0000-0000-0000-000000000000"])(
    "an unknown or malformed id (%s) is 404",
    async (id) => {
      expect((await patch(a, id, { direction: "up" })).status).toBe(404);
      expect((await del(a, id)).status).toBe(404);
    },
  );
});

describe("optional prices per 1M tokens (tenant's own estimate inputs)", () => {
  const patch = (t: Tenant, id: string, body: object) =>
    request(ctx.app).patch(`/api/dashboard/models/${id}`).set("cookie", t.cookie).send(body);
  const priceRow = async (id: string) =>
    (
      await ctx.pool.query(
        "SELECT input_price_per_1m AS i, output_price_per_1m AS o FROM tenant_models WHERE id = $1",
        [id],
      )
    ).rows[0];

  it("POST stores and returns prices as numbers; omitted prices are null (unpriced)", async () => {
    const priced = await as(a).post(
      "/models",
      newModel({ model_id: "p", input_price_per_1m: 0.15, output_price_per_1m: 0.6 }),
    );
    expect(priced.status).toBe(201);
    expect(priced.body.model).toMatchObject({ input_price_per_1m: 0.15, output_price_per_1m: 0.6 });
    const bare = await as(a).post("/models", newModel({ model_id: "q" }));
    expect(bare.body.model).toMatchObject({ input_price_per_1m: null, output_price_per_1m: null });
    const list = await as(a).get("/models");
    expect(
      list.body.models.cheap.map(
        (m: { input_price_per_1m: number | null }) => m.input_price_per_1m,
      ),
    ).toEqual([0.15, null]);
  });

  it.each([
    [{ input_price_per_1m: -1 }],
    [{ output_price_per_1m: -0.01 }],
    [{ input_price_per_1m: "free" }],
    [{ output_price_per_1m: Number.MAX_SAFE_INTEGER }],
  ])("POST rejects invalid prices #%# with 422 and does not call the provider", async (over) => {
    const res = await as(a).post("/models", newModel(over));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_request");
    expect(provider.calls).toHaveLength(0);
  });

  it("PATCH sets, changes and clears prices without moving the model", async () => {
    const id = (await as(a).post("/models", newModel())).body.model.id;
    let res = await patch(a, id, { input_price_per_1m: 1.5, output_price_per_1m: 3 });
    expect(res.status).toBe(200);
    expect(res.body.models.cheap[0]).toMatchObject({
      id,
      position: 0,
      input_price_per_1m: 1.5,
      output_price_per_1m: 3,
    });
    expect(Number((await priceRow(id)).i)).toBe(1.5);
    await patch(a, id, { output_price_per_1m: 4 });
    expect(await priceRow(id)).toEqual({ i: "1.500000", o: "4.000000" }); // the untouched price is kept
    await patch(a, id, { input_price_per_1m: null, output_price_per_1m: null });
    expect(await priceRow(id)).toEqual({ i: null, o: null });
    res = await patch(a, id, { input_price_per_1m: 2, direction: "down" });
    expect(res.status).toBe(200);
    expect(Number((await priceRow(id)).i)).toBe(2);
  });

  it.each([[{}], [{ input_price_per_1m: -3 }], [{ output_price_per_1m: "x" }]])(
    "PATCH rejects invalid body #%# with 422",
    async (body) => {
      const id = (await as(a).post("/models", newModel())).body.model.id;
      expect((await patch(a, id, body)).status).toBe(422);
    },
  );

  it("tenant B cannot change tenant A's prices: 404 and nothing changes", async () => {
    const id = (
      await as(a).post("/models", newModel({ input_price_per_1m: 1, output_price_per_1m: 2 }))
    ).body.model.id;
    const res = await patch(b, id, { input_price_per_1m: 99 });
    expect([res.status, res.body.error.code]).toEqual([404, "not_found"]);
    expect(Number((await priceRow(id)).i)).toBe(1);
  });
});
