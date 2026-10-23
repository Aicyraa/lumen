import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";
import type { ChatResponse } from "../rag.js";
import type { Deps } from "../types.js";

interface LogInput {
  sources?: Partial<ChatResponse["sources"][number]>[];
  route?: Partial<ChatResponse["route"]>;
  usage?: Partial<ChatResponse["usage"]>;
  status?: string;
}

// Shared by POST /v1/chat (API key) and POST /api/dashboard/try (session). Tenant is req.tenantId.
export function chatHandler({ pool, rag, config, log }: Deps): RequestHandler {
  const body = z.object({ query: z.string().min(1).max(config.queryMaxChars), session_id: z.string().max(200).optional() });

  // Ids and scores only: never chunk text, never the answer (section 5).
  const insertLog = (req: Request, id: string | null, q: z.infer<typeof body>, r: LogInput) =>
    pool.query(
      `INSERT INTO request_logs (id, tenant_id, api_key_id, session_id, query, sources, model_tier, k, escalated,
                                 difficulty, top_score, tokens_in, tokens_out, cost_usd, latency_ms, status)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, $14, $15)`,
      [id, req.tenantId, req.apiKeyId ?? null, q.session_id ?? null, q.query,
        JSON.stringify((r.sources ?? []).map((s) => ({ document_id: s.document_id, chunk_id: s.chunk_id, score: s.score }))),
        r.route?.model_tier ?? null, r.route?.k ?? null, r.route?.escalated ?? null, r.route?.difficulty ?? null,
        r.route?.top_score ?? null, r.usage?.tokens_in ?? null, r.usage?.tokens_out ?? null, r.usage?.latency_ms ?? null,
        r.status ?? "ok"]);

  return async (req, res) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) throw new ApiError(422, "invalid_request", `Invalid request: ${parsed.error.issues[0].path.join(".") || "body"}.`);
    const q = parsed.data;

    const { rows: [{ n }] } = await pool.query(
      "SELECT count(*)::int AS n FROM request_logs WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())", [req.tenantId]);
    if (n >= config.maxRequestsPerMonth) throw new ApiError(429, "monthly_limit", "Monthly request allowance reached.");

    const started = Date.now();
    let result: ChatResponse;
    try {
      result = await rag.query(req.tenantId, q.query, q.session_id);
    } catch (err) {
      // a logging failure must not replace the real error
      await insertLog(req, null, q, { status: "provider_error", usage: { latency_ms: Date.now() - started } })
        .catch((e: Error) => log.error({ err: e.message }, "request_logs insert failed"));
      log.warn({ code: (err as { code?: string }).code }, "chat failed");
      throw err instanceof ApiError ? err : new ApiError(502, "provider_error", "The language model provider failed. Try again shortly.");
    }
    // A failed log write must not throw away an answer that was already paid for.
    await insertLog(req, result.request_id, q, result).catch((err) => log.error({ err: err.message }, "request_logs insert failed"));
    res.json(result);
  };
}
