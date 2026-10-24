import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../../shared/lib/errors.js";
import { MONTH_START_SQL } from "../../shared/lib/range.js";
import { priceAttempts, recordAttempts, type Attempt, type KnownModel } from "../../shared/services/modelCalls.js";
import { RagError, type ChatResponse, type ChatSource } from "../../shared/services/rag.js";
import type { Deps } from "../../shared/types/types.js";

interface LogInput {
  sources?: Partial<ChatResponse["sources"][number]>[];
  route?: Partial<ChatResponse["route"]>;
  usage?: Partial<ChatResponse["usage"]>;
  status?: string;
  cost?: number | null;
}
const isUuid = (v: unknown): v is string => typeof v === "string" && z.uuid().safeParse(v).success;

// Shared by POST /v1/chat (API key) and POST /api/dashboard/try (session). Tenant is req.tenantId.
export function chatHandler({ pool, rag, config, log }: Deps, { tryIt = false } = {}): RequestHandler {
  const body = z.object({ query: z.string().min(1).max(config.queryMaxChars), session_id: z.string().max(config.sessionIdMaxChars).optional() });

  // Ids and scores only: never chunk text, never the answer (section 5).
  const insertLog = (req: Request, id: string | null, q: z.infer<typeof body>, r: LogInput) =>
    pool.query(
      // Written only while the project still exists: a chat that finishes after its project was deleted leaves no orphan row.
      // The share lock makes the check wait for a delete that is committing.
      `INSERT INTO request_logs (id, tenant_id, api_key_id, session_id, query, sources, model_tier, k, escalated,
                                 difficulty, top_score, tokens_in, tokens_out, cost_usd, latency_ms, status)
       SELECT COALESCE($1::uuid, gen_random_uuid()), $2::text, $3::text, $4::text, $5::text, $6::jsonb, $7::text, $8::int, $9::boolean,
              $10::real, $11::real, $12::int, $13::int, $16::numeric, $14::int, $15::text
       WHERE EXISTS (SELECT 1 FROM organization WHERE id = $2::text FOR SHARE)`,
      [id, req.tenantId, req.apiKeyId ?? null, q.session_id ?? null, q.query,
        JSON.stringify((r.sources ?? []).map((s) => ({ document_id: s.document_id, chunk_id: s.chunk_id, score: s.score }))),
        r.route?.model_tier ?? null, r.route?.k ?? null, r.route?.escalated ?? null, r.route?.difficulty ?? null,
        r.route?.top_score ?? null, r.usage?.tokens_in ?? null, r.usage?.tokens_out ?? null, r.usage?.latency_ms ?? null,
        r.status ?? "ok", r.cost ?? null]);

  return async (req, res) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) throw new ApiError(422, "invalid_request", `Invalid request: ${parsed.error.issues[0].path.join(".") || "body"}.`);
    const q = parsed.data;

    const { rows: [{ n }] } = await pool.query(
      `SELECT count(*)::int AS n FROM request_logs WHERE tenant_id = $1 AND created_at >= ${MONTH_START_SQL}`, [req.tenantId]);
    if (n >= config.maxRequestsPerMonth) throw new ApiError(429, "monthly_limit", "Monthly request allowance reached.");

    const started = Date.now();
    const known = req.tenantModels?.known ?? new Map<string, KnownModel>();
    // Attempts are bookkeeping: a failure here must not replace the answer or the real error.
    const book = async (requestId: string, attempts: Attempt[]) =>
      recordAttempts(pool, req.tenantId, requestId, attempts, config).catch((e: Error) => log.error({ err: e.message }, "model_calls write failed"));

    let result: ChatResponse;
    try {
      result = await rag.query(req.tenantId, q.query, q.session_id, { models: req.tenantModels?.payload, includeSnippets: tryIt });
    } catch (err) {
      const failedId = randomUUID();
      const { attempts, total } = priceAttempts(err instanceof RagError ? err.attempts : [], known, config);
      await insertLog(req, failedId, q, { status: "provider_error", usage: { latency_ms: Date.now() - started }, cost: total })
        .catch((e: Error) => log.error({ err: e.message }, "request_logs insert failed"));
      await book(failedId, attempts);
      log.warn({ code: (err as { code?: string }).code }, "chat failed");
      if (err instanceof ApiError) throw err;
      // Express's own messages: never relay text from the service, it may quote a provider's error.
      if (err instanceof RagError && err.code === "no_models_configured") throw new ApiError(422, "no_models_configured", "No models are configured. Add a model in the Models tab.");
      throw new ApiError(502, "provider_error", "The language model provider failed. Try again shortly.");
    }
    const { attempts, total } = priceAttempts(result.attempts ?? [], known, config);
    // A failed log write must not throw away an answer that was already paid for.
    await insertLog(req, result.request_id, q, { ...result, cost: total }).catch((err) => log.error({ err: err.message }, "request_logs insert failed"));
    await book(result.request_id, attempts);

    // Public response is built field by field, so attempts, rate limits and keys can never leak through.
    const names = tryIt ? await filenames(req.tenantId, result.sources) : new Map<string, string>();
    const sources = result.sources.map((s: ChatSource) => ({
      document_id: s.document_id, chunk_id: s.chunk_id, score: s.score,
      ...(tryIt ? { filename: names.get(s.document_id) ?? null, snippet: typeof s.snippet === "string" ? s.snippet.slice(0, config.snippetMaxChars) : undefined } : {}),
    }));
    res.json({ request_id: result.request_id, answer: result.answer, sources, route: result.route, usage: { ...result.usage, cost_usd: total } });
  };

  // Filename via a tenant-scoped read (rule 1): another tenant's document id gives no name.
  async function filenames(tenantId: string, sources: ChatSource[]) {
    const ids = [...new Set(sources.map((s) => s.document_id).filter(isUuid))];
    if (!ids.length) return new Map<string, string>();
    const { rows } = await pool.query("SELECT id, filename FROM documents WHERE tenant_id = $1 AND id = ANY($2::uuid[])", [tenantId, ids]);
    return new Map<string, string>(rows.map((r: { id: string; filename: string }) => [r.id, r.filename]));
  }
}
