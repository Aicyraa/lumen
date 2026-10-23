import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx } from "./helpers/ctx.js";

async function withCtx(overrides, fn) {
  const ctx = await makeCtx({ maxRequestsPerMonth: 100000, ...overrides });
  try { await fn(ctx); } finally { await ctx.close(); }
}
const chat = (ctx, t) => request(ctx.app).post("/v1/chat").set("x-api-key", t.apiKey).send({ query: "q" });
const tryIt = (ctx, t) => request(ctx.app).post("/api/dashboard/try").set("cookie", t.cookie).send({ query: "q" });

describe("requireSession on /api/dashboard/*", () => {
  it("rejects missing sessions with 401 unauthorized and lets a signed-in user list only their documents", async () => {
    await withCtx({ ratePerMinute: 1000 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      const b = await ctx.createTenant("b");
      await ctx.pool.query("INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'mine.md', 'ready'), ($2, 'theirs.md', 'ready')", [a.tenantId, b.tenantId]);
      for (const [method, path] of [["get", "/api/dashboard/documents"], ["post", "/api/dashboard/documents"], ["post", "/api/dashboard/try"]]) {
        const res = await request(ctx.app)[method](path);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("unauthorized");
      }
      const list = await request(ctx.app).get("/api/dashboard/documents").set("cookie", a.cookie);
      expect(list.status).toBe(200);
      expect(list.body.documents.map((d) => d.filename)).toEqual(["mine.md"]);
    });
  });

  it("uploads, reads and deletes through the dashboard with the session's organization as tenant", async () => {
    await withCtx({ ratePerMinute: 1000 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      const b = await ctx.createTenant("b");
      const up = await request(ctx.app).post("/api/dashboard/documents").set("cookie", a.cookie).attach("file", Buffer.from("hi"), "x.txt");
      expect(up.status).toBe(202);
      const row = await ctx.pool.query("SELECT tenant_id FROM documents WHERE id = $1", [up.body.document_id]);
      expect(row.rows[0].tenant_id).toBe(a.tenantId);
      await ctx.app.locals.idle();
      const other = await request(ctx.app).delete(`/api/dashboard/documents/${up.body.document_id}`).set("cookie", b.cookie);
      expect(other.status).toBe(404);
      const own = await request(ctx.app).delete(`/api/dashboard/documents/${up.body.document_id}`).set("cookie", a.cookie);
      expect(own.status).toBe(204);
    });
  });

  it("POST /api/dashboard/try answers like /v1/chat and logs one row without an api_key_id", async () => {
    await withCtx({ ratePerMinute: 1000 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      const res = await tryIt(ctx, a);
      expect(res.status).toBe(200);
      expect(res.body.answer).toBe("Stub answer [1]");
      const rows = (await ctx.pool.query("SELECT api_key_id FROM request_logs WHERE tenant_id = $1", [a.tenantId])).rows;
      expect(rows).toEqual([{ api_key_id: null }]);
    });
  });
});

describe("per-tenant rate limit", () => {
  it("returns 429 rate_limited on /api/dashboard/try once RATE_LIMIT_PER_MINUTE is hit", async () => {
    await withCtx({ ratePerMinute: 3 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      for (let i = 0; i < 3; i++) expect((await tryIt(ctx, a)).status).toBe(200);
      const res = await tryIt(ctx, a);
      expect(res.status).toBe(429);
      expect(res.body).toEqual({ error: { code: "rate_limited", message: expect.any(String) } });
    });
  });

  it("shares one counter between /v1/chat and /api/dashboard/try for the same tenant", async () => {
    await withCtx({ ratePerMinute: 3 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      const b = await ctx.createTenant("b");
      expect((await chat(ctx, a)).status).toBe(200);
      expect((await tryIt(ctx, a)).status).toBe(200);
      expect((await chat(ctx, a)).status).toBe(200);
      expect((await chat(ctx, a)).status).toBe(429); // the Try it box already used part of the allowance
      expect((await tryIt(ctx, a)).status).toBe(429);
      expect((await chat(ctx, b)).status).toBe(200); // another tenant has its own counter
      expect(await ctx.app.locals.rateLimitUsed(a.tenantId)).toBeGreaterThanOrEqual(3);
    });
  });

  it("a limited request reaches neither the service nor request_logs", async () => {
    await withCtx({ ratePerMinute: 1 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      await chat(ctx, a);
      ctx.stub.calls.length = 0;
      expect((await chat(ctx, a)).status).toBe(429);
      expect(ctx.stub.calls).toHaveLength(0);
      expect((await ctx.pool.query("SELECT 1 FROM request_logs WHERE tenant_id = $1", [a.tenantId])).rowCount).toBe(1);
    });
  });
});

describe("global cap on LLM-calling routes", () => {
  it("returns 429 rate_limited across tenants once the configured cap is hit", async () => {
    await withCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 2 }, async (ctx) => {
      const a = await ctx.createTenant("a");
      const b = await ctx.createTenant("b");
      expect((await chat(ctx, a)).status).toBe(200);
      expect((await tryIt(ctx, b)).status).toBe(200);
      const res = await chat(ctx, b);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("rate_limited");
    });
  });
});
