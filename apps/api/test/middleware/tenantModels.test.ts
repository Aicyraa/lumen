import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";

const KEY_GOOD = "sk-good-endpoint-GGGG1111";
const KEY_FLIP = "sk-flipped-endpoint-FFFF2222";
let ctx: Ctx;
afterEach(async () => { await ctx.close(); });

const chat = (t: Tenant) => request(ctx.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" });
const sent = () => ctx.stub.calls.filter((c) => c.name === "query").at(-1)?.body as { models?: Record<string, { model_id: string }[]> } | undefined;
const status = async (t: Tenant, id: string) => (await ctx.pool.query("SELECT status FROM tenant_models WHERE id = $1 AND tenant_id = $2", [id, t.tenantId])).rows[0].status;
const setup = async (overrides = {}) => {
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000, maxRequestsPerMonth: 1000, endpointGuardCacheTtlMs: 0, ...overrides });
  const t = await ctx.createTenant("t");
  const good = await ctx.seedModel(t, "cheap", "good", KEY_GOOD, "https://good.example.test/v1");
  const flip = await ctx.seedModel(t, "cheap", "flip", KEY_FLIP, "https://flip.example.test/v1");
  return { t, good, flip };
};

describe("rule 12 at use time: endpoints are re-checked before a key is sent", () => {
  it("sends both models while their hosts resolve to public addresses", async () => {
    const { t } = await setup();
    await chat(t);
    expect(sent()!.models!.cheap.map((m) => m.model_id)).toEqual(["good", "flip"]);
  });

  it("drops a model whose host now resolves to the metadata address, never sends its key, and marks it failing", async () => {
    const { t, good, flip } = await setup();
    ctx.dns.set("flip.example.test", "169.254.169.254"); // the host was public when the model was saved
    const res = await chat(t);
    expect(res.status).toBe(200);
    expect(sent()!.models!.cheap.map((m) => m.model_id)).toEqual(["good"]);
    expect(JSON.stringify(ctx.stub.calls)).not.toContain(KEY_FLIP);
    expect(await status(t, flip)).toBe("failing");
    expect(await status(t, good)).toBe("connected");
  });

  it("only touches the calling tenant's rows", async () => {
    const { t, flip } = await setup();
    const other = await ctx.createTenant("other");
    const theirs = await ctx.seedModel(other, "cheap", "theirs", KEY_FLIP, "https://flip.example.test/v1");
    ctx.dns.set("flip.example.test", "10.0.0.7");
    await chat(t);
    expect(await status(t, flip)).toBe("failing");
    expect(await status(other, theirs)).toBe("connected");
  });

  it("in production, 422 no_models_configured when every model fails the check, and the service is never called", async () => {
    const { t, good, flip } = await setup({ production: true });
    ctx.dns.set("good.example.test", "127.0.0.1");
    ctx.dns.set("flip.example.test", "192.168.1.9");
    const res = await chat(t);
    expect([res.status, res.body.error.code]).toEqual([422, "no_models_configured"]);
    expect(ctx.stub.calls).toHaveLength(0);
    expect([await status(t, good), await status(t, flip)]).toEqual(["failing", "failing"]);
  });

  it("in production, one surviving model is still used", async () => {
    const { t } = await setup({ production: true });
    ctx.dns.set("flip.example.test", "169.254.169.254");
    expect((await chat(t)).status).toBe(200);
    expect(sent()!.models!.cheap.map((m) => m.model_id)).toEqual(["good"]);
  });

  it("outside production, when none pass, sends no models (the service falls back to its env default)", async () => {
    const { t } = await setup();
    ctx.dns.set("good.example.test", "10.1.1.1");
    ctx.dns.set("flip.example.test", "10.1.1.2");
    expect((await chat(t)).status).toBe(200);
    expect(sent()).not.toHaveProperty("models");
    expect(JSON.stringify(ctx.stub.calls)).not.toMatch(/GGGG1111|FFFF2222/);
  });

  it("caches a host's verdict for endpointGuardCacheTtlMs, and re-resolves every time when the TTL is 0", async () => {
    const { t } = await setup({ endpointGuardCacheTtlMs: 60_000 });
    await chat(t); await chat(t);
    expect(ctx.dnsCalls.filter((h) => h === "good.example.test")).toHaveLength(1);
    await ctx.close();
    const fresh = await setup({ endpointGuardCacheTtlMs: 0 });
    await chat(fresh.t); await chat(fresh.t);
    expect(ctx.dnsCalls.filter((h) => h === "good.example.test")).toHaveLength(2);
  });
});
