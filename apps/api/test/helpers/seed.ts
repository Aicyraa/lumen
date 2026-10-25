import { randomUUID } from "node:crypto";
import type { Pool } from "../../src/shared/db/pool.js";

export interface LogSeed {
  id?: string;
  query?: string;
  tier?: string | null; // 'cheap' | 'expensive' | 'none' | null (a failed call)
  k?: number | null;
  escalated?: boolean | null;
  difficulty?: number | null;
  topScore?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  cost?: number | null;
  latency?: number | null;
  status?: string;
  feedback?: number | null;
  apiKeyId?: string | null;
  sources?: unknown[];
  createdAt?: string; // any timestamptz literal, e.g. '2026-10-20T10:00:00.000000Z'
  ago?: string; // postgres interval, e.g. '3 days'; ignored when createdAt is set
}

// Inserts one request_logs row directly (no HTTP) for the given tenant and returns its id.
export async function insertLog(pool: Pool, tenantId: string, s: LogSeed = {}): Promise<string> {
  const id = s.id ?? randomUUID();
  await pool.query(
    `INSERT INTO request_logs (id, tenant_id, api_key_id, query, model_tier, k, escalated, difficulty, top_score,
                               latency_ms, status, feedback, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, now() - $14::interval))`,
    [
      id,
      tenantId,
      s.apiKeyId ?? null,
      s.query ?? "a question",
      s.tier === undefined ? "cheap" : s.tier,
      s.k === undefined ? 3 : s.k,
      s.escalated === undefined ? false : s.escalated,
      s.difficulty === undefined ? 0 : s.difficulty,
      s.topScore === undefined ? 0.7 : s.topScore,
      s.latency ?? null,
      s.status ?? "ok",
      s.feedback ?? null,
      s.createdAt ?? null,
      s.ago ?? "0 seconds",
    ],
  );
  // Tokens and cost are derived from model_calls (view request_usage), so they are seeded as one attempt.
  if (s.tokensIn != null || s.tokensOut != null || s.cost != null)
    await pool.query(
      `INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome, tokens_in, tokens_out, cost_usd)
       VALUES ($1, $2, 'p', 'm', 'default', 'ok', $3, $4, $5)`,
      [tenantId, id, s.tokensIn ?? null, s.tokensOut ?? null, s.cost ?? null],
    );
  // Sources point only at this tenant's documents and chunks that exist; anything else is stored as unknown (NULL), like chat does.
  await pool.query(
    `INSERT INTO request_sources (request_id, tenant_id, position, document_id, chunk_id, score)
     SELECT $1::uuid, $2::text, (e.ord - 1)::int, d.id, c.id, (e.v ->> 'score')::real
     FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS e(v, ord)
     LEFT JOIN documents d ON d.tenant_id = $2::text AND d.id::text = e.v ->> 'document_id'
     LEFT JOIN chunks c ON c.tenant_id = $2::text AND c.id::text = e.v ->> 'chunk_id' AND c.document_id = d.id`,
    [id, tenantId, JSON.stringify(s.sources ?? [])],
  );
  return id;
}

// A document with `n` chunks (its chunk_count is the document_stats view, not a column). Returns the document id.
export async function insertDoc(
  pool: Pool,
  tenantId: string,
  n = 0,
  o: { filename?: string; status?: string; error?: string | null; createdAt?: string } = {},
): Promise<string> {
  const {
    rows: [d],
  } = await pool.query(
    `INSERT INTO documents (tenant_id, filename, status, error, created_at)
     VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now())) RETURNING id`,
    [tenantId, o.filename ?? "doc.md", o.status ?? "ready", o.error ?? null, o.createdAt ?? null],
  );
  for (let i = 0; i < n; i++)
    await pool.query(
      "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'x', array_fill(0, ARRAY[384])::vector)",
      [tenantId, d.id],
    );
  return d.id;
}
