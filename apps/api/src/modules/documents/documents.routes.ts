import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { extname } from "node:path";
import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "../../shared/lib/errors.js";
import { uploadName } from "../../shared/lib/uploads.js";
import { RagError } from "../../shared/services/rag.js";
import type { Deps } from "../../shared/types/types.js";

const ALLOWED = new Set([".pdf", ".txt", ".md"]);
const isUuid = (v: string) => z.uuid().safeParse(v).success;
// What the dashboard shows for a document the service could not ingest (documents.error); anything else is "code: message".
export const INGEST_FAILURE_REASONS: Record<string, string> = {
  document_too_large:
    "This document is too large to process. Split it into smaller files and upload them again.",
  unreadable_document:
    "This file could not be read. Check that it is a valid PDF that is not password-protected, then upload it again.",
  busy: "The service is busy. Try again shortly.",
};
const failureReason = (err: Error & { code?: string }) =>
  (
    (err.code && INGEST_FAILURE_REASONS[err.code]) ||
    (err.code ? `${err.code}: ${err.message}` : err.message)
  ).slice(0, 500);
const notFound = () => new ApiError(404, "not_found", "Document not found.");

// Shared by /v1/documents (API key) and /api/dashboard/documents (session): the tenant is req.tenantId.
export function documentsRouter(
  { pool, rag, config, log, pending }: Deps,
  uploadLimiter: RequestHandler,
) {
  const r = Router();
  mkdirSync(config.uploadDir, { recursive: true });
  const uploadFile = multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename: (req, _file, cb) => cb(null, uploadName(req.tenantId, randomUUID())),
    }),
    limits: { fileSize: config.uploadMaxBytes, files: 1 },
    fileFilter: (_req, file, cb) =>
      ALLOWED.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new ApiError(415, "unsupported_type", "Only PDF, .txt and .md files are supported.")),
  }).single("file");

  const parseUpload = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) =>
      uploadFile(req, res, (err: unknown) => {
        if ((err as { code?: string } | undefined)?.code === "LIMIT_FILE_SIZE")
          err = new ApiError(413, "file_too_large", "The file is larger than the upload limit.");
        else if (err && !(err instanceof ApiError))
          err = new ApiError(
            422,
            "invalid_request",
            "Upload must be multipart with one 'file' field.",
          );
        err ? reject(err) : resolve();
      }),
    );

  // Insert under a per-tenant advisory lock so two uploads cannot both slip under the limit.
  async function insertWithinLimit(tenantId: string, filename: string): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenantId]);
      const {
        rows: [{ n }],
      } = await client.query("SELECT count(*)::int AS n FROM documents WHERE tenant_id = $1", [
        tenantId,
      ]);
      if (n >= config.maxDocuments)
        throw new ApiError(429, "document_limit", "Document limit reached for this account.");
      // Ingests that crashed with their process stay 'processing' until the next sweep; past the cutoff they no longer count.
      const {
        rows: [{ running }],
      } = await client.query(
        `SELECT count(*)::int AS running FROM documents
         WHERE tenant_id = $1 AND status = 'processing' AND created_at > now() - make_interval(secs => $2)`,
        [tenantId, config.interruptedIngestAfterSeconds],
      );
      if (running >= config.maxConcurrentIngests)
        throw new ApiError(
          429,
          "ingest_limit",
          "Too many documents are being processed. Try again shortly.",
          config.ingestLimitRetryAfterSeconds,
        );
      const { rows } = await client.query(
        "INSERT INTO documents (tenant_id, filename) VALUES ($1, $2) RETURNING id",
        [tenantId, filename],
      );
      await client.query("COMMIT");
      return rows[0].id;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Runs after the 202 has been sent. Python writes chunks in one transaction, so a failure leaves none.
  // Nothing in here may reject: nobody awaits this job, so a throw would be an unhandled rejection.
  async function ingest(
    tenantId: string,
    id: string,
    path: string,
    filename: string,
  ): Promise<void> {
    const attempt = (what: string, fn: () => Promise<unknown>) =>
      fn().catch((err: Error) => log.error({ documentId: id, err: err.message }, what));
    try {
      await ingestWithRetry(tenantId, id, path, filename); // the chunk count is the document_stats view, not a stored value
      await pool.query(
        "UPDATE documents SET status = 'ready' WHERE id = $1 AND tenant_id = $2 AND status = 'processing'",
        [id, tenantId],
      );
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err instanceof RagError && err.status === 409) {
        // The service refuses a document that is already failed or gone: its row is not ours to change.
        log.warn({ documentId: id, code: err.code }, "ingest skipped: document not ingestable");
      } else {
        await attempt("ingest status update failed", () =>
          pool.query(
            "UPDATE documents SET status = 'failed', error = $3 WHERE id = $1 AND tenant_id = $2 AND status = 'processing'",
            [id, tenantId, failureReason(err)],
          ),
        );
        // The Python DELETE would remove the document row too, hiding the failure, so drop partial chunks here.
        await attempt("ingest chunk cleanup failed", () =>
          pool.query("DELETE FROM chunks WHERE tenant_id = $1 AND document_id = $2", [
            tenantId,
            id,
          ]),
        );
        log.warn({ documentId: id, code: err.code }, "ingest failed");
      }
    } finally {
      await attempt("upload cleanup failed", () =>
        unlink(path).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        }),
      );
    }
  }

  // 503 busy means the service had no free slot: wait (its Retry-After, capped) and try again a bounded number of times.
  async function ingestWithRetry(tenantId: string, id: string, path: string, filename: string) {
    for (let n = 0; ; n++) {
      try {
        return await rag.ingest(tenantId, id, path, filename);
      } catch (e) {
        if (!(e instanceof RagError && e.code === "busy" && e.status === 503)) throw e;
        if (n >= config.ingestBusyRetries) throw e;
        const wait = e.busyRetryAfterSeconds
          ? e.busyRetryAfterSeconds * 1000
          : config.ingestBusyBackoffMs * 2 ** n;
        await new Promise((r) => setTimeout(r, Math.min(wait, config.ingestBusyBackoffMaxMs)));
      }
    }
  }

  r.post("/", uploadLimiter, async (req, res) => {
    await parseUpload(req, res);
    if (!req.file) throw new ApiError(422, "invalid_request", "A 'file' field is required.");
    let id: Awaited<ReturnType<typeof insertWithinLimit>>;
    try {
      id = await insertWithinLimit(req.tenantId, req.file.originalname.slice(0, 255));
    } catch (err) {
      await unlink(req.file.path).catch(() => {});
      throw err;
    }
    const job = ingest(req.tenantId, id, req.file.path, req.file.originalname).finally(() =>
      pending.delete(job),
    );
    pending.add(job);
    res.status(202).json({ document_id: id, status: "processing" });
  });

  r.get("/:id", async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const { rows } = await pool.query(
      `SELECT d.id, d.status, s.chunk_count, d.error
       FROM documents d JOIN document_stats s ON s.document_id = d.id AND s.tenant_id = d.tenant_id
       WHERE d.id = $1 AND d.tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) throw notFound();
    res.json({
      document_id: rows[0].id,
      status: rows[0].status,
      chunk_count: rows[0].chunk_count,
      error: rows[0].error,
    });
  });

  r.delete("/:id", async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    // chunks go with the row (ON DELETE CASCADE); the internal call is belt and braces
    const { rowCount } = await pool.query(
      "DELETE FROM documents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!rowCount) throw notFound();
    await rag
      .remove(req.tenantId, req.params.id)
      .catch((err) => log.warn({ code: err.code }, "internal delete failed"));
    res.status(204).end();
  });

  return r;
}
