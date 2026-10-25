import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({
    ratePerMinute: 1000,
    globalLlmCapPerMinute: 1000,
    maxRequestsPerMonth: 1000,
  });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => ctx.stub.reset());

const seedDoc = async (t: Tenant) => {
  const {
    rows: [d],
  } = await ctx.pool.query(
    "INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'f.md', 'ready') RETURNING id",
    [t.tenantId],
  );
  const {
    rows: [c],
  } = await ctx.pool.query(
    "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'x', array_fill(0, ARRAY[384])::vector) RETURNING id",
    [t.tenantId, d.id],
  );
  return { doc: d.id as string, chunk: Number(c.id) };
};
const answerWith = (sources: object[]) => {
  ctx.stub.handlers.query = () => ({
    status: 200,
    body: {
      request_id: randomUUID(),
      answer: "ok",
      sources,
      route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.7 },
      usage: { tokens_in: 1, tokens_out: 1, cost_usd: null, latency_ms: 1 },
      attempts: [
        {
          provider: "p",
          model_id: "m",
          tier: "default",
          outcome: "ok",
          tokens_in: 812,
          tokens_out: 96,
          latency_ms: 5,
        },
      ],
    },
  });
};
const chat = (t: Tenant) =>
  request(ctx.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" });

describe("chat writes request_sources", () => {
  it("stores one row per source in order, with ids only for this tenant's documents and chunks", async () => {
    const mine = await seedDoc(a);
    const theirs = await seedDoc(b);
    answerWith([
      { document_id: mine.doc, chunk_id: mine.chunk, score: 0.8 },
      { document_id: theirs.doc, chunk_id: theirs.chunk, score: 0.6 }, // another tenant's ids: stored as unknown
      { document_id: randomUUID(), chunk_id: 99999999, score: 0.4 },
    ]);
    const res = await chat(a);
    expect(res.status).toBe(200);
    const { rows } = await ctx.pool.query(
      "SELECT position, document_id, chunk_id, score FROM request_sources WHERE request_id = $1 AND tenant_id = $2 ORDER BY position",
      [res.body.request_id, a.tenantId],
    );
    expect(rows).toEqual([
      {
        position: 0,
        document_id: mine.doc,
        chunk_id: String(mine.chunk),
        score: expect.closeTo(0.8, 5),
      },
      { position: 1, document_id: null, chunk_id: null, score: expect.closeTo(0.6, 5) },
      { position: 2, document_id: null, chunk_id: null, score: expect.closeTo(0.4, 5) },
    ]);
    expect(
      (
        await ctx.pool.query(
          "SELECT 1 FROM request_sources WHERE tenant_id = $1 AND request_id = $2",
          [b.tenantId, res.body.request_id],
        )
      ).rowCount,
    ).toBe(0);
  });

  it("derives the logged tokens from the attempts through request_usage", async () => {
    answerWith([]);
    const res = await chat(a);
    const { rows } = await ctx.pool.query(
      "SELECT tokens_in, tokens_out FROM request_usage WHERE request_id = $1 AND tenant_id = $2",
      [res.body.request_id, a.tenantId],
    );
    expect(rows).toEqual([{ tokens_in: 812, tokens_out: 96 }]);
  });
});
