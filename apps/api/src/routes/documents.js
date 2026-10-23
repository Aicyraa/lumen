import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { extname } from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { ApiError } from "../errors.js";

const ALLOWED = new Set([".pdf", ".txt", ".md"]);
const isUuid = (v) => z.uuid().safeParse(v).success;
const notFound = () => new ApiError(404, "not_found", "Document not found.");

// Shared by /v1/documents (API key) and /api/dashboard/documents (session): the tenant is req.tenantId.
export function documentsRouter({ pool, rag, config, log, pending }) {
  const r = Router();
  mkdirSync(config.uploadDir, { recursive: true });
  const uploadFile = multer({
    storage: multer.diskStorage({ destination: config.uploadDir, filename: (req, file, cb) => cb(null, randomUUID()) }),
    limits: { fileSize: config.uploadMaxBytes, files: 1 },
    fileFilter: (req, file, cb) =>
      ALLOWED.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new ApiError(415, "unsupported_type", "Only PDF, .txt and .md files are supported.")),
  }).single("file");

  const parseUpload = (req, res) =>
    new Promise((resolve, reject) =>
      uploadFile(req, res, (err) => {
        if (err?.code === "LIMIT_FILE_SIZE") err = new ApiError(413, "file_too_large", "The file is larger than the upload limit.");
        else if (err && !(err instanceof ApiError)) err = new ApiError(422, "invalid_request", "Upload must be multipart with one 'file' field.");
        err ? reject(err) : resolve();
      }));

  // Insert under a per-tenant advisory lock so two uploads cannot both slip under the limit.
  async function insertWithinLimit(tenantId, filename) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenantId]);
      const { rows: [{ n }] } = await client.query("SELECT count(*)::int AS n FROM documents WHERE tenant_id = $1", [tenantId]);
      if (n >= config.maxDocuments) throw new ApiError(429, "document_limit", "Document limit reached for this account.");
      const { rows } = await client.query(
        "INSERT INTO documents (tenant_id, filename) VALUES ($1, $2) RETURNING id", [tenantId, filename]);
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
  async function ingest(tenantId, id, path, filename) {
    try {
      const { chunk_count } = await rag.ingest(tenantId, id, path, filename);
      await pool.query(
        "UPDATE documents SET status = 'ready', chunk_count = $3 WHERE id = $1 AND tenant_id = $2 AND status = 'processing'",
        [id, tenantId, chunk_count]);
    } catch (err) {
      const reason = (err.code ? `${err.code}: ${err.message}` : err.message).slice(0, 500);
      await pool.query(
        "UPDATE documents SET status = 'failed', error = $3 WHERE id = $1 AND tenant_id = $2 AND status = 'processing'",
        [id, tenantId, reason]);
      // The Python DELETE would remove the document row too, hiding the failure, so drop partial chunks here.
      await pool.query("DELETE FROM chunks WHERE tenant_id = $1 AND document_id = $2", [tenantId, id]);
      log.warn({ documentId: id, code: err.code }, "ingest failed");
    } finally {
      await unlink(path).catch(() => {});
    }
  }

  r.post("/", async (req, res) => {
    await parseUpload(req, res);
    if (!req.file) throw new ApiError(422, "invalid_request", "A 'file' field is required.");
    let id;
    try {
      id = await insertWithinLimit(req.tenantId, req.file.originalname.slice(0, 255));
    } catch (err) {
      await unlink(req.file.path).catch(() => {});
      throw err;
    }
    const job = ingest(req.tenantId, id, req.file.path, req.file.originalname).finally(() => pending.delete(job));
    pending.add(job);
    res.status(202).json({ document_id: id, status: "processing" });
  });

  r.get("/:id", async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const { rows } = await pool.query(
      "SELECT id, status, chunk_count, error FROM documents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) throw notFound();
    res.json({ document_id: rows[0].id, status: rows[0].status, chunk_count: rows[0].chunk_count, error: rows[0].error });
  });

  r.delete("/:id", async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    // chunks go with the row (ON DELETE CASCADE); the internal call is belt and braces
    const { rowCount } = await pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
    if (!rowCount) throw notFound();
    await rag.remove(req.tenantId, req.params.id).catch((err) => log.warn({ code: err.code }, "internal delete failed"));
    res.status(204).end();
  });

  return r;
}
