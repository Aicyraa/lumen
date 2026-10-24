import { Router } from "express";
import { parseRange, rangeStart } from "../../shared/lib/range.js";
import { modelUsage } from "../../shared/services/modelUsage.js";
import type { Deps } from "../../shared/types/types.js";
import "../../shared/types/types.js";

// Dashboard Analytics tab. Every statement filters by tenant_id. Days are UTC days; cost is the tenant's estimated provider cost.
export function analyticsRouter({ pool, config }: Deps) {
  const r = Router();

  r.get("/summary", async (req, res) => {
    const { range, days } = parseRange(req.query.range);
    const since = rangeStart(days);

    const [perDay, mix, latency, byModel] = await Promise.all([
      pool.query(
        `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                count(*) FILTER (WHERE model_tier = 'cheap')::int AS cheap,
                count(*) FILTER (WHERE model_tier = 'expensive')::int AS expensive,
                count(*) FILTER (WHERE model_tier = 'none')::int AS none,
                count(*) FILTER (WHERE model_tier IS NULL)::int AS failed,
                sum(cost_usd)::float8 AS cost_usd
         FROM request_logs WHERE tenant_id = $1 AND created_at >= $2 GROUP BY 1`, [req.tenantId, since]),
      pool.query(
        `SELECT count(*) FILTER (WHERE model_tier = 'cheap')::int AS cheap,
                count(*) FILTER (WHERE model_tier = 'expensive' AND escalated)::int AS escalated,
                count(*) FILTER (WHERE model_tier = 'expensive' AND NOT COALESCE(escalated, false))::int AS expensive_hard,
                count(*) FILTER (WHERE model_tier = 'none')::int AS none,
                count(*) FILTER (WHERE model_tier IS NULL)::int AS failed,
                sum(cost_usd)::float8 AS total_cost_usd
         FROM request_logs WHERE tenant_id = $1 AND created_at >= $2`, [req.tenantId, since]),
      pool.query( // answered requests only: a failed call's latency is a timeout, not service time
        `SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms))::int AS median,
                round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::int AS p95
         FROM request_logs WHERE tenant_id = $1 AND created_at >= $2 AND status = 'ok' AND latency_ms IS NOT NULL`, [req.tenantId, since]),
      modelUsage(pool, req.tenantId, since),
    ]);

    const byDate = new Map<string, { cheap: number; expensive: number; none: number; failed: number; cost_usd: number | null }>(perDay.rows.map(({ date, ...d }) => [date, d]));
    const per_day = Array.from({ length: days }, (_, i) => {
      const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      return { date, ...(byDate.get(date) ?? { cheap: 0, expensive: 0, none: 0, failed: 0, cost_usd: null }) };
    });
    const { total_cost_usd, ...route_mix } = mix.rows[0];
    res.json({
      range,
      total_requests: Object.values(route_mix as Record<string, number>).reduce((s, n) => s + n, 0),
      per_day,
      route_mix,
      latency_ms: latency.rows[0],
      total_cost_usd, // sum of request_logs.cost_usd; null when no priced model answered
      by_model: byModel.models,
    });
  });

  // Questions the documents could not answer: no model was called, or the best match scored below the threshold.
  r.get("/unanswered", async (req, res) => {
    const { range, days } = parseRange(req.query.range);
    const where = "tenant_id = $1 AND created_at >= $2 AND (model_tier = 'none' OR top_score < $3)";
    const args = [req.tenantId, rangeStart(days), config.unansweredScoreBelow];
    const [list, count] = await Promise.all([
      pool.query(
        `SELECT id, query, top_score, model_tier AS tier, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time
         FROM request_logs WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $4`, [...args, config.unansweredPageSize]),
      pool.query(`SELECT count(*)::int AS n FROM request_logs WHERE ${where}`, args),
    ]);
    res.json({ range, threshold: config.unansweredScoreBelow, total: count.rows[0].n, items: list.rows });
  });

  return r;
}
