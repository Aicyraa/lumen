import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sweepInterrupted } from "../../../src/modules/documents/sweep.js";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ interruptedIngestAfterSeconds: 600 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

const zero = `[${new Array(384).fill(0).join(",")}]`;
const insert = async (tenantId: string, status: string, ageMinutes: number) =>
  (
    await ctx.pool.query(
      `INSERT INTO documents (tenant_id, filename, status, created_at) VALUES ($1, 'x.md', $2, now() - make_interval(mins => $3)) RETURNING id`,
      [tenantId, status, ageMinutes],
    )
  ).rows[0].id;
const sweep = () =>
  sweepInterrupted({ pool: ctx.pool, config: ctx.config, log: { info() {}, warn() {} } });
const row = async (id: string) =>
  (await ctx.pool.query("SELECT status, error FROM documents WHERE id = $1", [id])).rows[0];

describe("interrupted-ingest sweep", () => {
  it("marks processing rows older than the cutoff as failed 'ingest interrupted', for every tenant, and drops their chunks", async () => {
    const oldA = await insert(a.tenantId, "processing", 11);
    const oldB = await insert(b.tenantId, "processing", 30);
    await ctx.pool.query(
      "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'partial', $3)",
      [a.tenantId, oldA, zero],
    );
    ctx.stub.calls.length = 0;
    // like the real service, its DELETE endpoint removes the document row as well as the chunks
    ctx.stub.handlers.delete = async ({ query, params }) => {
      await ctx.pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [
        params.id,
        query.tenant_id,
      ]);
      return { status: 200, body: { deleted_chunks: 0 } };
    };
    await sweep();
    ctx.stub.reset();
    expect(await row(oldA)).toEqual({ status: "failed", error: "ingest interrupted" });
    expect(await row(oldB)).toEqual({ status: "failed", error: "ingest interrupted" });
    expect(
      (await ctx.pool.query("SELECT 1 FROM chunks WHERE document_id = $1", [oldA])).rowCount,
    ).toBe(0);
  });

  it("leaves recent processing rows and finished rows alone", async () => {
    const fresh = await insert(a.tenantId, "processing", 2);
    const ready = await insert(a.tenantId, "ready", 120);
    await sweep();
    expect((await row(fresh)).status).toBe("processing");
    expect((await row(ready)).status).toBe("ready");
  });

  it("deletes leftover upload files older than the cutoff", async () => {
    mkdirSync(ctx.config.uploadDir, { recursive: true });
    const stale = join(ctx.config.uploadDir, "stale-upload");
    const fresh = join(ctx.config.uploadDir, "fresh-upload");
    writeFileSync(stale, "x");
    writeFileSync(fresh, "x");
    const old = new Date(Date.now() - 20 * 60 * 1000);
    utimesSync(stale, old, old);
    await sweep();
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });
});
