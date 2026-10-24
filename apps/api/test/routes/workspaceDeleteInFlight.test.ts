import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";

let ctx: Ctx, u: Tenant, project: string, other: Tenant;
beforeEach(async () => {
  ctx = await makeCtx({ ratePerMinute: 1000, globalLlmCapPerMinute: 1000, maxRequestsPerMonth: 1000 });
  u = await ctx.createTenant("owner");
  other = await ctx.createTenant("other");
  const made = await request(ctx.app).post("/api/dashboard/workspaces").set("cookie", u.cookie).send({ name: "Doomed" });
  project = made.body.workspace.id;
});
afterEach(async () => { await ctx.close(); });

const files = () => (existsSync(ctx.config.uploadDir) ? readdirSync(ctx.config.uploadDir) : []);
const remove = () => request(ctx.app).delete(`/api/dashboard/workspaces/${project}`).set("cookie", u.cookie).send({ name: "Doomed" });
const countsFor = async (tenantId: string) => (await ctx.pool.query(
  `SELECT (SELECT count(*)::int FROM request_logs WHERE tenant_id = $1) AS logs, (SELECT count(*)::int FROM model_calls WHERE tenant_id = $1) AS calls,
          (SELECT count(*)::int FROM documents WHERE tenant_id = $1) AS docs, (SELECT count(*)::int FROM chunks WHERE tenant_id = $1) AS chunks,
          (SELECT count(*)::int FROM organization WHERE id = $1) AS orgs`, [tenantId])).rows[0];
const gate = () => { let open!: () => void; const wait = new Promise<void>((r) => { open = r; }); return { wait, open }; };

describe("deleting a project and the uploads it left behind", () => {
  it("removes the project's pending upload files (named with the tenant id) and leaves other tenants' files alone", async () => {
    const mine = join(ctx.config.uploadDir, `${project}__orphan-1`);
    const theirs = join(ctx.config.uploadDir, `${other.tenantId}__keep-1`);
    writeFileSync(mine, "x"); writeFileSync(theirs, "y");
    try {
      expect((await remove()).status).toBe(204);
      expect(existsSync(mine)).toBe(false);
      expect(existsSync(theirs)).toBe(true);
    } finally { rmSync(mine, { force: true }); rmSync(theirs, { force: true }); }
  });

  it("an upload in progress is stored under the tenant's prefix, and deleting the project mid-ingest leaves no document, chunk or file behind", async () => {
    const g = gate();
    ctx.stub.handlers.ingest = async () => { await g.wait; return { status: 200, body: { chunk_count: 3 } }; };
    const key = (await ctx.auth.api.createApiKey({ body: { name: "k", organizationId: project, userId: u.userId } })).key;
    const before = new Set(files());
    const up = await request(ctx.app).post("/v1/documents").set("x-api-key", key).attach("file", Buffer.from("hello"), "a.txt");
    expect(up.status).toBe(202);
    const mine = files().filter((f) => !before.has(f));
    expect(mine).toHaveLength(1);
    expect(mine[0].startsWith(`${project}__`)).toBe(true);

    expect((await remove()).status).toBe(204);
    expect(files().filter((f) => f.startsWith(`${project}__`))).toEqual([]);
    g.open(); // the ingest finishes after the project is gone
    await ctx.app.locals.idle();
    expect(await countsFor(project)).toEqual({ logs: 0, calls: 0, docs: 0, chunks: 0, orgs: 0 });
    expect(files().filter((f) => f.startsWith(`${project}__`))).toEqual([]);
  });

  it("does not delete any file when the deletion itself fails (files go only after the commit)", async () => {
    const mine = join(ctx.config.uploadDir, `${project}__pending`);
    writeFileSync(mine, "x");
    await ctx.pool.query(`CREATE OR REPLACE FUNCTION test_block_org_delete2() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked for test'; END $$ LANGUAGE plpgsql`);
    await ctx.pool.query(`CREATE TRIGGER test_block2 BEFORE DELETE ON organization FOR EACH ROW WHEN (OLD.id = '${project}') EXECUTE FUNCTION test_block_org_delete2()`);
    try {
      expect((await remove()).status).toBe(500);
      expect(existsSync(mine)).toBe(true);
    } finally { await ctx.pool.query("DROP TRIGGER test_block2 ON organization"); rmSync(mine, { force: true }); }
  });

  it("a chat that was already running when the project was deleted writes no request log and no model_calls row", async () => {
    const g = gate();
    ctx.stub.handlers.query = async (call) => { await g.wait; return { status: 200, body: {
      request_id: "3f0c1b2a-0000-4000-8000-0000000000aa", answer: "late", sources: [], route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.7 },
      usage: { tokens_in: 1, tokens_out: 1, cost_usd: null, latency_ms: 1 }, attempts: [{ provider: "p", model_id: "m", tier: "default", outcome: "ok", tokens_in: 1, tokens_out: 1, latency_ms: 1 }] } }; };
    const key = (await ctx.auth.api.createApiKey({ body: { name: "k", organizationId: project, userId: u.userId } })).key;
    const chat = request(ctx.app).post("/v1/chat").set("x-api-key", key).send({ query: "hello" }).then((r) => r);
    for (let i = 0; i < 100 && !ctx.stub.calls.some((c) => c.name === "query"); i++) await new Promise((r) => setTimeout(r, 20)); // wait until the request is inside the service call
    expect((await remove()).status).toBe(204);
    g.open();
    const res = await chat;
    expect(res.status).toBe(200); // the caller still gets its answer
    expect(await countsFor(project)).toEqual({ logs: 0, calls: 0, docs: 0, chunks: 0, orgs: 0 });
  });
});
