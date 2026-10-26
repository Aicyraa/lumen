import { existsSync, readdirSync } from "node:fs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertDoc as seedDoc } from "../../helpers/seed.js";
import { until, uploadFile } from "../../helpers/uploads.js";

let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({ maxDocuments: 3, uploadMaxBytes: 2048, ingestTimeoutMs: 400 });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

const upload = (
  tenant: Tenant,
  name = "handbook.md",
  body = "# Handbook\nOpening hours are nine to five.",
  fields: Record<string, string> = {},
) => uploadFile(ctx, tenant, { name, body, fields });
const status = (tenant: Tenant, id: string) =>
  request(ctx.app).get(`/v1/documents/${id}`).set("x-api-key", tenant.apiKey);
// The status flips before the background cleanup (service delete, file removal) finishes, so tests also wait for the effect itself with until().
async function settle(tenant: Tenant, id: string) {
  let body: Record<string, any> = {};
  await until(
    async () => {
      body = (await status(tenant, id)).body;
      return body.status !== "processing";
    },
    { tries: 50 },
  );
  return body;
}
const uploadCount = () =>
  existsSync(ctx.config.uploadDir) ? readdirSync(ctx.config.uploadDir).length : 0;
const clean = () =>
  ctx.pool.query("DELETE FROM documents WHERE tenant_id = ANY($1)", [[a.tenantId, b.tenantId]]);

describe("POST /v1/documents", () => {
  it("answers 202 processing, forwards to /internal/ingest with the key's tenant, then marks ready", async () => {
    await clean();
    ctx.stub.calls.length = 0;
    ctx.stub.handlers.ingest = async ({ body }) => {
      for (
        let i = 0;
        i < 3;
        i++ // what the Python service does: it writes the chunks
      )
        await ctx.pool.query(
          "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'c', array_fill(0, ARRAY[384])::vector)",
          [body.tenant_id, body.document_id],
        );
      return { status: 200, body: { chunk_count: 3 } };
    };
    const res = await upload(a, "handbook.md", "hello world", { tenant_id: b.tenantId }); // a body field must not pick the tenant
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ document_id: expect.any(String), status: "processing" });

    const final = await settle(a, res.body.document_id);
    expect(final).toMatchObject({ status: "ready", chunk_count: 3, error: null });
    const call = ctx.stub.calls.find((c) => c.name === "ingest");
    expect(call?.body).toMatchObject({ tenant_id: a.tenantId, document_id: res.body.document_id });
    expect(call?.file?.buffer.toString()).toBe("hello world");
    const row = await ctx.pool.query("SELECT tenant_id, filename FROM documents WHERE id = $1", [
      res.body.document_id,
    ]);
    expect(row.rows[0]).toEqual({ tenant_id: a.tenantId, filename: "handbook.md" });
  });

  it("marks the document failed with the service's reason when ingest returns 422", async () => {
    ctx.stub.handlers.ingest = () => ({
      status: 422,
      body: {
        error: { code: "no_text_extracted", message: "No text could be extracted from the file." },
      },
    });
    const res = await upload(a, "scan.pdf");
    const final = await settle(a, res.body.document_id);
    expect(final.status).toBe("failed");
    expect(final.error).toContain("no_text_extracted");
    ctx.stub.handlers.ingest = () => ({ status: 200, body: { chunk_count: 3 } });
  });

  it("marks the document failed on timeout, keeps the failed row visible and leaves no chunks", async () => {
    // like the real service: it had committed a chunk, then never answered; its DELETE endpoint removes the document row too
    ctx.stub.handlers.ingest = async ({ body }) => {
      await ctx.pool.query(
        "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'partial', $3)",
        [body.tenant_id, body.document_id, `[${new Array(384).fill(0).join(",")}]`],
      );
      return new Promise(() => {});
    };
    ctx.stub.handlers.delete = async ({ query, params }) => {
      await ctx.pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [
        params.id,
        query.tenant_id,
      ]);
      return { status: 200, body: { deleted_chunks: 1 } };
    };
    const filesBefore = uploadCount();
    const res = await upload(a, "slow.txt");
    const final = await settle(a, res.body.document_id);
    expect(final.status).toBe("failed");
    await until(
      async () =>
        (
          await ctx.pool.query("SELECT 1 FROM chunks WHERE document_id = $1", [
            res.body.document_id,
          ])
        ).rowCount === 0,
    );
    await until(() => uploadCount() === filesBefore); // its file goes too, before the next test counts files
    ctx.stub.reset();
  });

  it("does not leave the uploaded file on disk once ingest has finished", async () => {
    const before = uploadCount();
    const res = await upload(a, "notes.txt");
    await settle(a, res.body.document_id);
    await until(() => uploadCount() === before);
  });

  it("rejects unsupported types with 415 and creates no row", async () => {
    await clean();
    const res = await upload(a, "malware.exe");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("unsupported_type");
    expect(
      (await ctx.pool.query("SELECT 1 FROM documents WHERE tenant_id = $1", [a.tenantId])).rowCount,
    ).toBe(0);
  });

  it("rejects files over the configured size with 413 file_too_large", async () => {
    const res = await upload(a, "big.txt", "x".repeat(4096));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("rejects a request without a file with 422 invalid_request", async () => {
    const res = await request(ctx.app).post("/v1/documents").set("x-api-key", a.apiKey);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("returns 429 document_limit at MAX_DOCUMENTS_PER_TENANT, per tenant", async () => {
    await clean();
    for (let i = 0; i < 3; i++) expect((await upload(a, `d${i}.txt`)).status).toBe(202);
    const over = await upload(a, "d4.txt");
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("document_limit");
    expect((await upload(b, "other.txt")).status).toBe(202); // b has its own allowance
    await clean();
  });
});

describe("DELETE /v1/documents/:id", () => {
  const insertDoc = (tenantId: string) => seedDoc(ctx.pool, tenantId, 0, { filename: "x.md" });
  const zeroVector = `[${new Array(384).fill(0).join(",")}]`;

  it("returns 204, calls the internal delete with the tenant, and the chunks cascade away", async () => {
    const id = await insertDoc(a.tenantId);
    await ctx.pool.query(
      "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'c', $3)",
      [a.tenantId, id, zeroVector],
    );
    ctx.stub.calls.length = 0;
    const res = await request(ctx.app).delete(`/v1/documents/${id}`).set("x-api-key", a.apiKey);
    expect(res.status).toBe(204);
    expect(ctx.stub.calls.find((c) => c.name === "delete")).toMatchObject({
      query: { tenant_id: a.tenantId },
      params: { id },
    });
    expect((await ctx.pool.query("SELECT 1 FROM documents WHERE id = $1", [id])).rowCount).toBe(0);
    expect(
      (await ctx.pool.query("SELECT 1 FROM chunks WHERE document_id = $1", [id])).rowCount,
    ).toBe(0);
  });

  it("another tenant's id returns 404, leaves the row alone and never reaches the service", async () => {
    const id = await insertDoc(b.tenantId);
    ctx.stub.calls.length = 0;
    const res = await request(ctx.app).delete(`/v1/documents/${id}`).set("x-api-key", a.apiKey);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expect((await ctx.pool.query("SELECT 1 FROM documents WHERE id = $1", [id])).rowCount).toBe(1);
    expect(ctx.stub.calls).toHaveLength(0);
  });
});
