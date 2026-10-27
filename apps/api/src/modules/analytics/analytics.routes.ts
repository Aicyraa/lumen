import { Router } from "express";
import { parseRange, rangeStart } from "../../shared/lib/range.js";
import { modelUsage } from "../../shared/services/modelUsage.js";
import type { Deps } from "../../shared/types/types.js";

// Dashboard Analytics tab. Every statement filters by tenant_id. Days are UTC days; cost is the tenant's estimated provider cost.
export function analyticsRouter({ pool, config }: Deps) {
  const r = Router();

  r.get("/summary", async (req, res) => {
    const { range, days } = parseRange(req.query.range);
    const since = rangeStart(days);

    const [perDay, mix, latency, byModel] = await Promise.all([
      pool.query(
        `SELECT to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                count(*) FILTER (WHERE r.model_tier = 'cheap')::int AS cheap,
                count(*) FILTER (WHERE r.model_tier = 'expensive')::int AS expensive,
                count(*) FILTER (WHERE r.model_tier = 'none')::int AS none,
                count(*) FILTER (WHERE r.model_tier IS NULL)::int AS failed,
                sum(u.cost_usd)::float8 AS cost_usd
         FROM request_logs r LEFT JOIN request_usage u ON u.request_id = r.id AND u.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1 AND r.created_at >= $2 GROUP BY 1`,
        [req.tenantId, since],
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE r.model_tier = 'cheap')::int AS cheap,
                count(*) FILTER (WHERE r.model_tier = 'expensive' AND r.escalated)::int AS escalated,
                count(*) FILTER (WHERE r.model_tier = 'expensive' AND NOT COALESCE(r.escalated, false))::int AS expensive_hard,
                count(*) FILTER (WHERE r.model_tier = 'none')::int AS none,
                count(*) FILTER (WHERE r.model_tier IS NULL)::int AS failed,
                sum(u.cost_usd)::float8 AS total_cost_usd
         FROM request_logs r LEFT JOIN request_usage u ON u.request_id = r.id AND u.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1 AND r.created_at >= $2`,
        [req.tenantId, since],
      ),
      pool.query(
        // answered requests only: a failed call's latency is a timeout, not service time
        `SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms))::int AS median,
                round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::int AS p95
         FROM request_logs WHERE tenant_id = $1 AND created_at >= $2 AND status = 'ok' AND latency_ms IS NOT NULL`,
        [req.tenantId, since],
      ),
      modelUsage(pool, req.tenantId, since),
    ]);

    const byDate = new Map<
      string,
      { cheap: number; expensive: number; none: number; failed: number; cost_usd: number | null }
    >(perDay.rows.map(({ date, ...d }) => [date, d]));
    const per_day = Array.from({ length: days }, (_, i) => {
      const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      return {
        date,
        ...(byDate.get(date) ?? { cheap: 0, expensive: 0, none: 0, failed: 0, cost_usd: null }),
      };
    });
    const { total_cost_usd, ...route_mix } = mix.rows[0];
    res.json({
      range,
      total_requests: Object.values(route_mix as Record<string, number>).reduce((s, n) => s + n, 0),
      per_day,
      route_mix,
      latency_ms: latency.rows[0],
      total_cost_usd, // sum of request_usage.cost_usd; null when no priced model answered
      by_model: byModel.models,
    });
  });

  // Two disjoint groups of questions the documents did not answer. Every statement filters by tenant_id.
  //  no_match:  no model was called, or the best match scored below the threshold.
  //  not_found: a model ran on a match at or above the threshold (status ok) but the answer cited no source.
  // A NULL tier or NULL score never satisfies not_found; a NULL score never satisfies no_match either (a NULL tier with a weak score does, as before).
  r.get("/unanswered", async (req, res) => {
    const { range, days } = parseRange(req.query.range);
    const base = [req.tenantId, rangeStart(days), config.unansweredScoreBelow];
    const noMatch = "(r.model_tier = 'none' OR r.top_score < $3)";
    const notFound = `r.status = 'ok' AND r.model_tier IS NOT NULL AND r.model_tier <> 'none' AND r.top_score >= $3
      AND NOT EXISTS (SELECT 1 FROM request_sources s WHERE s.request_id = r.id AND s.tenant_id = r.tenant_id)`;
    const time = `to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time`;
    const where = (cond: string) => `r.tenant_id = $1 AND r.created_at >= $2 AND ${cond}`;
    const [nmList, nmCount, nfList, nfCount] = await Promise.all([
      pool.query(
        `SELECT r.id, r.query, r.top_score, r.model_tier AS tier, ${time}
         FROM request_logs r WHERE ${where(noMatch)} ORDER BY r.created_at DESC, r.id DESC LIMIT $4`,
        [...base, config.unansweredPageSize],
      ),
      pool.query(`SELECT count(*)::int AS n FROM request_logs r WHERE ${where(noMatch)}`, base),
      pool.query(
        // model = the last attempt of the request (model_calls has no FK to request_logs, so tenant_id is on the join)
        `SELECT r.id, r.query, r.top_score, r.model_tier AS tier,
                CASE WHEN m.id IS NULL THEN NULL ELSE json_build_object('provider', m.provider, 'model_id', m.model_id) END AS model,
                r.difficulty, r.escalated, ${time}
         FROM request_logs r
         LEFT JOIN LATERAL (
           SELECT c.id, c.provider, c.model_id FROM model_calls c
           WHERE c.tenant_id = r.tenant_id AND c.request_id = r.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1
         ) m ON true
         WHERE ${where(notFound)} ORDER BY r.created_at DESC, r.id DESC LIMIT $4`,
        [...base, config.unansweredPageSize],
      ),
      pool.query(`SELECT count(*)::int AS n FROM request_logs r WHERE ${where(notFound)}`, base),
    ]);
    res.json({
      range,
      threshold: config.unansweredScoreBelow,
      no_match: { total: nmCount.rows[0].n, items: nmList.rows },
      not_found: { total: nfCount.rows[0].n, items: nfList.rows },
    });
  });

  return r;
}
