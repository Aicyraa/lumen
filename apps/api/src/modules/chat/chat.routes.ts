import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../../shared/lib/errors.js";
import { MONTH_START_SQL } from "../../shared/lib/range.js";
import {
  type Attempt,
  type KnownModel,
  priceAttempts,
  recordAttempts,
} from "../../shared/services/modelCalls.js";
import { type ChatResponse, type ChatSource, RagError } from "../../shared/services/rag.js";
import type { Deps } from "../../shared/types/types.js";

interface LogInput {
  sources?: Partial<ChatResponse["sources"][number]>[];
  route?: Partial<ChatResponse["route"]>;
  usage?: Partial<ChatResponse["usage"]>;
  status?: string;
}
const isUuid = (v: unknown): v is string => typeof v === "string" && z.uuid().safeParse(v).success;

// Shared by POST /v1/chat (API key) and POST /api/dashboard/try (session). Tenant is req.tenantId.
export function chatHandler(
  { pool, rag, config, log }: Deps,
  { tryIt = false } = {},
): RequestHandler {
  const body = z.object({
    query: z.string().min(1).max(config.queryMaxChars),
    session_id: z.string().max(config.sessionIdMaxChars).optional(),
  });

  // Ids and scores only: never chunk text, never the answer (section 5). Tokens and cost are not stored here: they are the
  // sum of this request's model_calls rows (view request_usage).
  // One statement writes the request and its sources. It writes only while the project still exists: a chat that finishes after
  // its project was deleted leaves nothing. The share lock makes the check wait for a delete that is committing.
  // A source id that is not this tenant's document or chunk is stored as unknown (NULL), never as another tenant's id.
  const insertLog = (req: Request, id: string | null, q: z.infer<typeof body>, r: LogInput) =>
    pool.query(
      `WITH log AS (
         INSERT INTO request_logs (id, tenant_id, api_key_id, session_id, query, model_tier, k, escalated,
                                   difficulty, top_score, latency_ms, status)
         SELECT COALESCE($1::uuid, gen_random_uuid()), $2::text, $3::text, $4::text, $5::text, $7::text, $8::int, $9::boolean,
                $10::real, $11::real, $12::int, $13::text
         WHERE EXISTS (SELECT 1 FROM tenants WHERE id = $2::text FOR SHARE)
         RETURNING id, tenant_id
       )
       INSERT INTO request_sources (request_id, tenant_id, position, document_id, chunk_id, score)
       SELECT l.id, l.tenant_id, (e.ord - 1)::int, d.id, c.id, (e.v ->> 'score')::real
       FROM log l
       CROSS JOIN LATERAL jsonb_array_elements($6::jsonb) WITH ORDINALITY AS e(v, ord)
       LEFT JOIN documents d ON d.tenant_id = l.tenant_id AND d.id = (e.v ->> 'document_id')::uuid
       LEFT JOIN chunks c ON c.tenant_id = l.tenant_id AND c.id = (e.v ->> 'chunk_id')::bigint AND c.document_id = d.id`,
      [
        id,
        req.tenantId,
        req.apiKeyId ?? null,
        q.session_id ?? null,
        q.query,
        JSON.stringify(
          (r.sources ?? []).map((s) => ({
            document_id: isUuid(s.document_id) ? s.document_id : null,
            chunk_id: Number.isSafeInteger(s.chunk_id) ? s.chunk_id : null,
            score: Number.isFinite(s.score) ? s.score : null,
          })),
        ),
        r.route?.model_tier ?? null,
        r.route?.k ?? null,
        r.route?.escalated ?? null,
        r.route?.difficulty ?? null,
        r.route?.top_score ?? null,
        r.usage?.latency_ms ?? null,
        r.status ?? "ok",
      ],
    );

  return async (req, res) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success)
      throw new ApiError(
        422,
        "invalid_request",
        `Invalid request: ${parsed.error.issues[0].path.join(".") || "body"}.`,
      );
    const q = parsed.data;

    const {
      rows: [{ n }],
    } = await pool.query(
      `SELECT count(*)::int AS n FROM request_logs WHERE tenant_id = $1 AND created_at >= ${MONTH_START_SQL}`,
      [req.tenantId],
    );
    if (n >= config.maxRequestsPerMonth)
      throw new ApiError(429, "monthly_limit", "Monthly request allowance reached.");

    const started = Date.now();
    const known = req.tenantModels?.known ?? new Map<string, KnownModel>();
    // Attempts are bookkeeping: a failure here must not replace the answer or the real error.
    const book = async (requestId: string, attempts: Attempt[]) =>
      recordAttempts(pool, req.tenantId, requestId, attempts, config).catch((e: Error) =>
        log.error({ err: e.message }, "model_calls write failed"),
      );

    let result: ChatResponse;
    try {
      result = await rag.query(req.tenantId, q.query, q.session_id, {
        models: req.tenantModels?.payload,
        includeSnippets: tryIt,
      });
    } catch (err) {
      const failedId = randomUUID();
      const { attempts } = priceAttempts(
        err instanceof RagError ? err.attempts : [],
        known,
        config,
      );
      await insertLog(req, failedId, q, {
        status: "provider_error",
        usage: { latency_ms: Date.now() - started },
      }).catch((e: Error) => log.error({ err: e.message }, "request_logs insert failed"));
      await book(failedId, attempts);
      log.warn({ code: (err as { code?: string }).code }, "chat failed");
      if (err instanceof ApiError) throw err;
      // Express's own messages: never relay text from the service, it may quote a provider's error.
      if (err instanceof RagError && err.code === "no_models_configured")
        throw new ApiError(
          422,
          "no_models_configured",
          "No models are configured. Add a model in the Models tab.",
        );
      throw new ApiError(
        502,
        "provider_error",
        "The language model provider failed. Try again shortly.",
      );
    }
    const { attempts, total } = priceAttempts(result.attempts ?? [], known, config);
    // A failed log write must not throw away an answer that was already paid for.
    await insertLog(req, result.request_id, q, result).catch((err) =>
      log.error({ err: err.message }, "request_logs insert failed"),
    );
    await book(result.request_id, attempts);

    // Public response is built field by field, so attempts, rate limits and keys can never leak through.
    const names = tryIt ? await filenames(req.tenantId, result.sources) : new Map<string, string>();
    const sources = result.sources.map((s: ChatSource) => ({
      document_id: s.document_id,
      chunk_id: s.chunk_id,
      score: s.score,
      ...(tryIt
        ? {
            filename: names.get(s.document_id) ?? null,
            snippet:
              typeof s.snippet === "string"
                ? s.snippet.slice(0, config.snippetMaxChars)
                : undefined,
          }
        : {}),
    }));
    res.json({
      request_id: result.request_id,
      answer: result.answer,
      sources,
      route: result.route,
      usage: { ...result.usage, cost_usd: total },
    });
  };

  // Filename via a tenant-scoped read (rule 1): another tenant's document id gives no name.
  async function filenames(tenantId: string, sources: ChatSource[]) {
    const ids = [...new Set(sources.map((s) => s.document_id).filter(isUuid))];
    if (!ids.length) return new Map<string, string>();
    const { rows } = await pool.query(
      "SELECT id, filename FROM documents WHERE tenant_id = $1 AND id = ANY($2::uuid[])",
      [tenantId, ids],
    );
    return new Map<string, string>(
      rows.map((r: { id: string; filename: string }) => [r.id, r.filename]),
    );
  }
}
