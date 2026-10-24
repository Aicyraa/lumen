import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../../shared/lib/errors.js";
import { parseRange, rangeStart } from "../../shared/lib/range.js";
import type { Deps } from "../../shared/types/types.js";
import "../../shared/types/types.js";

const TIERS = ["all", "cheap", "expensive", "none"];
// created_at as text keeps microseconds, which a JS Date would cut to milliseconds and break the keyset.
const TS = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const ISO_US = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const decodeCursor = (v: string): { ts: string; id: string } => {
  try {
    const [ts, id] = JSON.parse(Buffer.from(v, "base64url").toString());
    // exactly what TS produces, year 0001 or later (Postgres has no year 0); the date check also catches impossible days such as 02-31
    if (
      typeof ts === "string" &&
      ISO_US.test(ts) &&
      ts >= "0001" &&
      new Date(ts.slice(0, 23) + "Z").toISOString().slice(0, 19) === ts.slice(0, 19) &&
      z.uuid().safeParse(id).success
    )
      return { ts, id };
  } catch {
    /* falls through to the error */
  }
  throw new ApiError(422, "invalid_request", "cursor is not valid.");
};

// Dashboard Requests tab. Every statement filters by tenant_id; another tenant's id is a 404.
export function requestsRouter({ pool, config }: Deps) {
  const r = Router();

  r.get("/", async (req, res) => {
    const { days } = parseRange(req.query.range);
    const tier = req.query.tier === undefined ? "all" : String(req.query.tier);
    if (!TIERS.includes(tier))
      throw new ApiError(422, "invalid_request", "tier must be all, cheap, expensive or none.");
    let limit = config.requestsPageSizeDefault;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1)
        throw new ApiError(422, "invalid_request", "limit must be a positive integer.");
      limit = Math.min(limit, config.requestsPageSizeMax);
    }
    const cursor = req.query.cursor === undefined ? null : decodeCursor(String(req.query.cursor));

    const { rows } = await pool.query(
      `SELECT id, ${TS} AS ts, query, model_tier AS tier, k, escalated, latency_ms, tokens_in, tokens_out, cost_usd::float8 AS cost_usd, status
       FROM request_logs
       WHERE tenant_id = $1 AND created_at >= $2
         AND ($3::text = 'all' OR model_tier = $3)
         AND ($4::timestamptz IS NULL OR (created_at, id) < ($4::timestamptz, $5::uuid))
       ORDER BY created_at DESC, id DESC
       LIMIT $6`,
      [req.tenantId, rangeStart(days), tier, cursor?.ts ?? null, cursor?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    res.json({
      items: page.map(({ id, ts, ...i }) => ({ id, time: ts, ...i })),
      next_cursor:
        rows.length > limit
          ? Buffer.from(JSON.stringify([last.ts, last.id])).toString("base64url")
          : null,
    });
  });

  const notFound = () => new ApiError(404, "not_found", "Request not found.");
  const isUuid = (v: unknown): v is string =>
    typeof v === "string" && z.uuid().safeParse(v).success;

  r.get("/:id", async (req, res) => {
    if (!isUuid(req.params.id)) throw notFound();
    // The key row is joined on the tenant too: a key id from another tenant shows as no key.
    const {
      rows: [row],
    } = await pool.query(
      `SELECT r.id, ${TS.replaceAll("created_at", "r.created_at")} AS ts, r.query, r.status, r.sources, r.model_tier, r.k, r.escalated, r.difficulty, r.top_score,
              r.tokens_in, r.tokens_out, r.latency_ms, r.cost_usd::float8 AS cost_usd, r.feedback,
              ak.id AS key_id, ak.name AS key_name, ak.start AS key_start, ak.prefix AS key_prefix
       FROM request_logs r LEFT JOIN apikey ak ON ak.id = r.api_key_id AND ak."referenceId" = r.tenant_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (!row) throw notFound();

    // Sources hold ids and scores only; filename and passage are read now, both joins scoped to the tenant (rule 1).
    const stored = (Array.isArray(row.sources) ? row.sources : []) as {
      document_id?: unknown;
      chunk_id?: unknown;
      score?: unknown;
    }[];
    const docIds = [...new Set(stored.map((s) => s.document_id).filter(isUuid))];
    const chunkIds = [
      ...new Set(stored.map((s) => s.chunk_id).filter((c): c is number => Number.isSafeInteger(c))),
    ];
    const [docs, chunks] = await Promise.all([
      docIds.length
        ? pool.query(
            "SELECT id, filename FROM documents WHERE tenant_id = $1 AND id = ANY($2::uuid[])",
            [req.tenantId, docIds],
          )
        : { rows: [] },
      chunkIds.length
        ? pool.query(
            "SELECT id, document_id, left(content, $3) AS passage FROM chunks WHERE tenant_id = $1 AND id = ANY($2::bigint[])",
            [req.tenantId, chunkIds, config.passageMaxChars],
          )
        : { rows: [] },
    ]);
    const names = new Map<string, string>(
      docs.rows.map((d: { id: string; filename: string }) => [d.id, d.filename]),
    );
    const passages = new Map<string, string>(
      chunks.rows.map((c: { id: string; document_id: string; passage: string }) => [
        `${c.document_id}:${c.id}`,
        c.passage,
      ]),
    );

    res.json({
      id: row.id,
      time: row.ts,
      query: row.query,
      status: row.status,
      route: {
        tier: row.model_tier,
        k: row.k,
        escalated: row.escalated,
        difficulty: row.difficulty,
        top_score: row.top_score,
      },
      usage: {
        tokens_in: row.tokens_in,
        tokens_out: row.tokens_out,
        latency_ms: row.latency_ms,
        cost_usd: row.cost_usd,
      }, // cost is the tenant's estimate
      feedback: row.feedback,
      api_key: row.key_id
        ? { id: row.key_id, name: row.key_name, start: row.key_start, prefix: row.key_prefix }
        : null,
      sources: stored.map((s) => {
        const filename = isUuid(s.document_id) ? (names.get(s.document_id) ?? null) : null;
        return {
          document_id: s.document_id,
          chunk_id: s.chunk_id,
          score: s.score,
          filename,
          document_deleted: filename === null,
          passage: isUuid(s.document_id)
            ? (passages.get(`${s.document_id}:${s.chunk_id}`) ?? null)
            : null,
        };
      }),
    });
  });

  return r;
}
