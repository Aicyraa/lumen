import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

// Background ingest cleanup and the rag-service's ingest statuses (fake rag-service).
let ctx: Ctx, a: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({
    maxDocuments: 100,
    ingestBusyRetries: 2,
    ingestBusyBackoffMs: 10,
    ingestBusyBackoffMaxMs: 40,
  });
  a = await ctx.createTenant("a");
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => {
  vi.restoreAllMocks();
  ctx.stub.reset();
});

const upload = () =>
  request(ctx.app)
    .post("/v1/documents")
    .set("x-api-key", a.apiKey)
    .attach("file", Buffer.from("hello"), "f.md");
const row = async (id: string) =>
  (await ctx.pool.query("SELECT status, error FROM documents WHERE id = $1", [id])).rows[0];
const ingestCalls = () => ctx.stub.calls.filter((c) => c.name === "ingest").length;
const logs = () => ctx.logLines.join("");
const err = (status: number, code: string, headers?: Record<string, string>) => ({
  status,
  body: { error: { code, message: `service says ${code}` } },
  headers,
});

describe("background ingest cleanup", () => {
  it("logs a failed status update instead of throwing (no unhandled rejection)", async () => {
    const seen: unknown[] = [];
    const onRejection = (e: unknown) => seen.push(e);
    process.on("unhandledRejection", onRejection);
    try {
      ctx.stub.handlers.ingest = () => err(422, "no_text_extracted");
      const real = ctx.pool.query.bind(ctx.pool) as (...a: unknown[]) => unknown;
      vi.spyOn(ctx.pool, "query").mockImplementation(((...args: unknown[]) =>
        /SET status = 'failed'/.test(String(args[0]))
          ? Promise.reject(new Error("db down"))
          : real(...args)) as never);
      const res = await upload();
      expect(res.status).toBe(202);
      // not idle(): awaiting the job would handle its rejection and hide the bug
      await new Promise((r) => setTimeout(r, 300));
      expect(seen).toEqual([]);
      expect(logs()).toContain("ingest status update failed");
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("logs a failed file removal instead of throwing", async () => {
    ctx.stub.handlers.ingest = () => {
      // swap the uploaded file for a directory of the same name so unlink fails
      for (const name of readdirSync(ctx.config.uploadDir).filter((n) =>
        n.startsWith(`${a.tenantId}__`),
      )) {
        const p = join(ctx.config.uploadDir, name);
        rmSync(p);
        mkdirSync(p);
      }
      return { status: 200, body: { chunk_count: 1 } };
    };
    const res = await upload();
    await ctx.app.locals.idle();
    expect(logs()).toContain("upload cleanup failed");
    expect((await row(res.body.document_id)).status).toBe("ready");
    for (const name of readdirSync(ctx.config.uploadDir).filter((n) =>
      n.startsWith(`${a.tenantId}__`),
    ))
      rmSync(join(ctx.config.uploadDir, name), { recursive: true, force: true });
  });
});

describe("rag-service ingest statuses", () => {
  it("409 document_not_ingestable: not marked ready, existing failure kept, only logged", async () => {
    ctx.stub.handlers.ingest = async ({ body }) => {
      await ctx.pool.query(
        "UPDATE documents SET status = 'failed', error = 'ingest interrupted' WHERE id = $1 AND tenant_id = $2",
        [body.document_id, body.tenant_id],
      );
      return err(409, "document_not_ingestable");
    };
    const res = await upload();
    await ctx.app.locals.idle();
    expect(await row(res.body.document_id)).toEqual({
      status: "failed",
      error: "ingest interrupted",
    });
    expect(logs()).toContain("ingest skipped: document not ingestable");
  });

  it.each([
    [
      "document_too_large",
      "This document is too large to process. Split it into smaller files and upload them again.",
    ],
    [
      "unreadable_document",
      "This file could not be read. Check that it is a valid PDF that is not password-protected, then upload it again.",
    ],
  ])("422 %s stores the user-facing reason", async (code, reason) => {
    ctx.stub.handlers.ingest = () => err(422, code);
    const res = await upload();
    await ctx.app.locals.idle();
    expect(await row(res.body.document_id)).toEqual({ status: "failed", error: reason });
  });

  it("503 busy with Retry-After is retried, then the document becomes ready", async () => {
    let n = 0;
    ctx.stub.handlers.ingest = () =>
      ++n < 3
        ? err(503, "busy", { "Retry-After": "1" })
        : { status: 200, body: { chunk_count: 1 } };
    const started = Date.now();
    const res = await upload();
    await ctx.app.locals.idle();
    expect(ingestCalls()).toBe(3);
    expect((await row(res.body.document_id)).status).toBe("ready");
    expect(Date.now() - started).toBeLessThan(1000); // the wait is capped by ingestBusyBackoffMaxMs, not the 1 s header
  });

  it("503 busy that never clears fails after the bounded retries with a try-again reason", async () => {
    ctx.stub.handlers.ingest = () => err(503, "busy");
    const res = await upload();
    await ctx.app.locals.idle();
    expect(ingestCalls()).toBe(3); // first try + ingestBusyRetries
    expect(await row(res.body.document_id)).toEqual({
      status: "failed",
      error: "The service is busy. Try again shortly.",
    });
  });
});
