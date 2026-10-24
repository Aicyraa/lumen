import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../../helpers/ctx.js";
import { insertLog } from "../../helpers/seed.js";

const PASSAGE = "Spring enrollment closes on 15 March. ".repeat(20); // 760 chars
let ctx: Ctx, a: Tenant, b: Tenant, docA: string, docB: string, chunkA: number, chunkB: number, keyA: string, keyB: string;

async function addDoc(t: Tenant, filename: string, text: string) {
  const { rows: [d] } = await ctx.pool.query("INSERT INTO documents (tenant_id, filename, status, chunk_count) VALUES ($1, $2, 'ready', 1) RETURNING id", [t.tenantId, filename]);
  const { rows: [c] } = await ctx.pool.query(
    "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, $3, array_fill(0, ARRAY[384])::vector) RETURNING id", [t.tenantId, d.id, text]);
  return { doc: d.id as string, chunk: Number(c.id) };
}
const keyOf = async (t: Tenant) => (await ctx.pool.query(`SELECT id FROM apikey WHERE "referenceId" = $1 LIMIT 1`, [t.tenantId])).rows[0].id as string;

beforeAll(async () => {
  ctx = await makeCtx({ passageMaxChars: 300 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
  ({ doc: docA, chunk: chunkA } = await addDoc(a, "handbook.pdf", PASSAGE));
  ({ doc: docB, chunk: chunkB } = await addDoc(b, "b-secret.md", "B-ONLY-SECRET-PASSAGE"));
  [keyA, keyB] = [await keyOf(a), await keyOf(b)];
});
afterAll(async () => { await ctx.close(); });

const detail = (t: Tenant | null, id: string) => { const r = request(ctx.app).get(`/api/dashboard/requests/${id}`); return t ? r.set("cookie", t.cookie) : r; };

describe("GET /api/dashboard/requests/:id", () => {
  it("returns query, route, usage, feedback, the key used and sources with filename and a live passage", async () => {
    const gone = randomUUID();
    const sources = [
      { document_id: docA, chunk_id: chunkA, score: 0.78 },
      { document_id: gone, chunk_id: 999999, score: 0.5 }, // document deleted
      { document_id: docA, chunk_id: chunkA + 100000, score: 0.4 }, // chunk gone (re-ingested)
    ];
    const id = await insertLog(ctx.pool, a.tenantId, { query: "When does enrollment close?", tier: "expensive", k: 8, escalated: true, difficulty: 0.62, topScore: 0.78,
      tokensIn: 812, tokensOut: 96, cost: 0.0042, latency: 820, feedback: -1, apiKeyId: keyA, sources });
    const res = await detail(a, id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id, time: expect.any(String), query: "When does enrollment close?", status: "ok",
      route: { tier: "expensive", k: 8, escalated: true, difficulty: expect.closeTo(0.62, 5), top_score: expect.closeTo(0.78, 5) },
      usage: { tokens_in: 812, tokens_out: 96, latency_ms: 820, cost_usd: 0.0042 },
      feedback: -1,
      api_key: { id: keyA, name: "test", start: expect.any(String), prefix: null },
      sources: [
        { document_id: docA, chunk_id: chunkA, score: expect.closeTo(0.78, 5), filename: "handbook.pdf", document_deleted: false, passage: PASSAGE.slice(0, 300) },
        { document_id: gone, chunk_id: 999999, score: 0.5, filename: null, document_deleted: true, passage: null },
        { document_id: docA, chunk_id: chunkA + 100000, score: 0.4, filename: "handbook.pdf", document_deleted: false, passage: null },
      ],
    });
  });

  it("reads the passage live: nothing is stored in request_logs and no passage reaches the log", async () => {
    const id = await insertLog(ctx.pool, a.tenantId, { sources: [{ document_id: docA, chunk_id: chunkA, score: 0.9 }] });
    await detail(a, id);
    const { rows } = await ctx.pool.query("SELECT sources FROM request_logs WHERE id = $1 AND tenant_id = $2", [id, a.tenantId]);
    expect(rows[0].sources).toEqual([{ document_id: docA, chunk_id: chunkA, score: 0.9 }]);
    expect(ctx.logLines.join("")).not.toContain("Spring enrollment");
    await ctx.pool.query("UPDATE chunks SET content = 'edited later' WHERE id = $1 AND tenant_id = $2", [chunkA, a.tenantId]);
    expect((await detail(a, id)).body.sources[0].passage).toBe("edited later"); // view time, not log time
    await ctx.pool.query("UPDATE chunks SET content = $3 WHERE id = $1 AND tenant_id = $2", [chunkA, a.tenantId, PASSAGE]);
  });

  it("shows no key when the request came from Try it, the key was deleted, or the key belongs to another tenant", async () => {
    for (const apiKeyId of [null, "deleted-key-id", keyB]) {
      const id = await insertLog(ctx.pool, a.tenantId, { apiKeyId });
      expect((await detail(a, id)).body.api_key).toBeNull();
    }
  });

  it("handles a request with no sources and a failed request", async () => {
    const none = await insertLog(ctx.pool, a.tenantId, { tier: "none", k: 0, sources: [] });
    expect((await detail(a, none)).body).toMatchObject({ route: { tier: "none" }, sources: [] });
    const failed = await insertLog(ctx.pool, a.tenantId, { tier: null, status: "provider_error", k: null, escalated: null, topScore: null });
    expect((await detail(a, failed)).body).toMatchObject({ status: "provider_error", route: { tier: null, k: null } });
  });

  it("answers 404 not_found for another tenant's id, an unknown id and a non-UUID id; 401 without a session", async () => {
    const theirs = await insertLog(ctx.pool, b.tenantId, { query: "B only" });
    for (const id of [theirs, randomUUID(), "not-a-uuid", "1; DROP TABLE request_logs"]) {
      const res = await detail(a, id);
      expect([id, res.status, res.body.error?.code]).toEqual([id, 404, "not_found"]);
    }
    expect((await detail(b, theirs)).status).toBe(200);
    expect((await detail(null, theirs)).status).toBe(401);
  });

  it("never reads another tenant's document or chunk, even when the log row points at them", async () => {
    // a crafted/stale source naming B's ids must resolve like a deleted document, not leak B's filename or text
    const id = await insertLog(ctx.pool, a.tenantId, { sources: [{ document_id: docB, chunk_id: chunkB, score: 0.9 }, { document_id: docA, chunk_id: chunkB, score: 0.8 }] });
    const res = await detail(a, id);
    expect(res.body.sources[0]).toMatchObject({ filename: null, document_deleted: true, passage: null });
    expect(res.body.sources[1]).toMatchObject({ filename: "handbook.pdf", passage: null }); // the chunk exists, but not in A's document
    expect(JSON.stringify(res.body)).not.toMatch(/b-secret|B-ONLY-SECRET/);
  });

  it("truncates the passage to passageMaxChars from config", async () => {
    const short = await makeCtx({ passageMaxChars: 40 });
    try {
      const t = await short.createTenant("p");
      const { rows: [d] } = await short.pool.query("INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'p.md', 'ready') RETURNING id", [t.tenantId]);
      const { rows: [c] } = await short.pool.query("INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, $3, array_fill(0, ARRAY[384])::vector) RETURNING id", [t.tenantId, d.id, PASSAGE]);
      const id = await insertLog(short.pool, t.tenantId, { sources: [{ document_id: d.id, chunk_id: Number(c.id), score: 0.5 }] });
      const res = await request(short.app).get(`/api/dashboard/requests/${id}`).set("cookie", t.cookie);
      expect(res.body.sources[0].passage).toBe(PASSAGE.slice(0, 40));
    } finally { await short.close(); }
  });
});
