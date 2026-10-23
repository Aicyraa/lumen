import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { parseRange, rangeStart } from "../lib/range.js";
import type { Deps } from "../types/types.js";
import "../types/types.js";

const TIERS = ["all", "cheap", "expensive", "none"];
// created_at as text keeps microseconds, which a JS Date would cut to milliseconds and break the keyset.
const TS = `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const decodeCursor = (v: string): { ts: string; id: string } => {
  try {
    const [ts, id] = JSON.parse(Buffer.from(v, "base64url").toString());
    if (typeof ts === "string" && !Number.isNaN(Date.parse(ts)) && z.uuid().safeParse(id).success) return { ts, id };
  } catch { /* falls through to the error */ }
  throw new ApiError(422, "invalid_request", "cursor is not valid.");
};

// Dashboard Requests tab. Every statement filters by tenant_id; another tenant's id is a 404.
export function requestsRouter({ pool, config }: Deps) {
  const r = Router();

  r.get("/", async (req, res) => {
    const { days } = parseRange(req.query.range);
    const tier = req.query.tier === undefined ? "all" : String(req.query.tier);
    if (!TIERS.includes(tier)) throw new ApiError(422, "invalid_request", "tier must be all, cheap, expensive or none.");
    let limit = config.requestsPageSizeDefault;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1) throw new ApiError(422, "invalid_request", "limit must be a positive integer.");
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
      [req.tenantId, rangeStart(days), tier, cursor?.ts ?? null, cursor?.id ?? null, limit + 1]);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    res.json({
      items: page.map(({ id, ts, ...i }) => ({ id, time: ts, ...i })),
      next_cursor: rows.length > limit ? Buffer.from(JSON.stringify([last.ts, last.id])).toString("base64url") : null,
    });
  });

  return r;
}
