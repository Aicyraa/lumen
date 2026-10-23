import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";

const isUuid = (v) => z.uuid().safeParse(v).success;
const notFound = () => new ApiError(404, "not_found", "Document not found.");

// Shared by /v1/documents (API key) and /api/dashboard/documents (session): the tenant is req.tenantId.
export function documentsRouter({ pool }) {
  const r = Router();

  r.get("/:id", async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    const { rows } = await pool.query(
      "SELECT id, status, chunk_count, error FROM documents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) throw notFound();
    res.json({ document_id: rows[0].id, status: rows[0].status, chunk_count: rows[0].chunk_count, error: rows[0].error });
  });

  return r;
}
