import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({
    ratePerMinute: 100000,
    globalLlmCapPerMinute: 1000,
    maxRequestsPerMonth: 100000,
  });
  a = await ctx.createTenant("a");
});
afterAll(async () => {
  await ctx.close();
});
afterEach(async () => {
  ctx.stub.reset();
  await ctx.pool.query("DELETE FROM request_logs WHERE tenant_id = $1", [a.tenantId]);
});

const busy = (headers: Record<string, string> = { "retry-after": "3" }) => ({
  status: 503,
  headers,
  body: { error: { code: "busy", message: "The service is busy." } },
});

describe("rag 503 busy on /v1/chat", () => {
  it("answers 503 busy with Retry-After and never logs provider_error", async () => {
    ctx.stub.handlers.query = () => busy();
    const res = await request(ctx.app)
      .post("/v1/chat")
      .set("x-api-key", a.apiKey)
      .send({ query: "q" });
    expect([res.status, res.body.error.code, res.headers["retry-after"]]).toEqual([
      503,
      "busy",
      "3",
    ]);
    const { rows } = await ctx.pool.query(
      "SELECT status FROM request_logs WHERE tenant_id = $1",
      [a.tenantId],
    );
    expect(rows.map((r) => r.status)).not.toContain("provider_error");
  });

  it("still answers 503 busy when the service sent no valid Retry-After", async () => {
    ctx.stub.handlers.query = () => busy({});
    const res = await request(ctx.app)
      .post("/v1/chat")
      .set("x-api-key", a.apiKey)
      .send({ query: "q" });
    expect([res.status, res.body.error.code]).toEqual([503, "busy"]);
  });
});
