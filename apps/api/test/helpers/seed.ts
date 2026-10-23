import { randomUUID } from "node:crypto";
import type { Pool } from "../../src/db/pool.js";

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
    `INSERT INTO request_logs (id, tenant_id, api_key_id, query, sources, model_tier, k, escalated, difficulty, top_score,
                               tokens_in, tokens_out, cost_usd, latency_ms, status, feedback, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17::timestamptz, now() - $18::interval))`,
    [id, tenantId, s.apiKeyId ?? null, s.query ?? "a question", JSON.stringify(s.sources ?? []), s.tier === undefined ? "cheap" : s.tier,
      s.k === undefined ? 3 : s.k, s.escalated === undefined ? false : s.escalated, s.difficulty === undefined ? 0 : s.difficulty, s.topScore === undefined ? 0.7 : s.topScore, s.tokensIn ?? null, s.tokensOut ?? null,
      s.cost ?? null, s.latency ?? null, s.status ?? "ok", s.feedback ?? null, s.createdAt ?? null, s.ago ?? "0 seconds"]);
  return id;
}
