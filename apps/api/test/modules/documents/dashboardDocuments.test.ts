import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx();
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

describe("dashboard documents", () => {
  it("lists status, chunk_count, error and created_at for the tenant's documents only, newest first", async () => {
    await ctx.pool.query(
      `INSERT INTO documents (tenant_id, filename, status, chunk_count, error, created_at) VALUES
       ($1, 'ready.pdf', 'ready', 12, NULL, now() - interval '1 hour'),
       ($1, 'bad.pdf', 'failed', 0, 'no_text_extracted: scanned', now()),
       ($1, 'busy.md', 'processing', 0, NULL, now() - interval '2 hours'),
       ($2, 'theirs.md', 'ready', 3, NULL, now())`,
      [a.tenantId, b.tenantId],
    );
    const res = await request(ctx.app).get("/api/dashboard/documents").set("cookie", a.cookie);
    expect(res.status).toBe(200);
    expect(res.body.documents.map((d: { filename: string }) => d.filename)).toEqual([
      "bad.pdf",
      "ready.pdf",
      "busy.md",
    ]);
    expect(res.body.documents[0]).toEqual({
      document_id: expect.any(String),
      filename: "bad.pdf",
      status: "failed",
      error: "no_text_extracted: scanned",
      chunk_count: 0,
      created_at: expect.any(String),
    });
    expect(res.body.documents[1]).toMatchObject({ status: "ready", chunk_count: 12, error: null });
  });

  it("DELETE removes the tenant's document and its chunks; another tenant's id and a non-UUID are 404 and change nothing", async () => {
    const {
      rows: [d],
    } = await ctx.pool.query(
      "INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'del.md', 'ready') RETURNING id",
      [a.tenantId],
    );
    await ctx.pool.query(
      "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'x', array_fill(0, ARRAY[384])::vector)",
      [a.tenantId, d.id],
    );
    for (const id of [d.id, "not-a-uuid"]) {
      const res = await request(ctx.app)
        .delete(`/api/dashboard/documents/${id}`)
        .set("cookie", b.cookie);
      expect([id, res.status, res.body.error.code]).toEqual([id, 404, "not_found"]);
    }
    expect((await ctx.pool.query("SELECT 1 FROM documents WHERE id = $1", [d.id])).rowCount).toBe(
      1,
    );
    expect(
      (await request(ctx.app).delete(`/api/dashboard/documents/${d.id}`).set("cookie", a.cookie))
        .status,
    ).toBe(204);
    expect(
      (await ctx.pool.query("SELECT 1 FROM chunks WHERE document_id = $1", [d.id])).rowCount,
    ).toBe(0);
  });
});
