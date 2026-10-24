import type { Pool } from "../db/pool.js";

// Per-model figures from model_calls for the Models tab and Analytics "By model". Every table is filtered
// by tenant_id, including the subquery that finds earlier attempts of the same request.
export async function modelUsage(pool: Pool, tenantId: string, since: Date) {
  const { rows } = await pool.query(
    `SELECT m.id, m.tier, m.position, m.provider, m.model_id, m.status, m.rate_limits, m.rate_limits_seen_at,
            count(c.id)::int AS requests,
            COALESCE(sum(c.tokens_in), 0)::int AS tokens_in, COALESCE(sum(c.tokens_out), 0)::int AS tokens_out,
            count(c.id) FILTER (WHERE c.outcome = 'error')::int AS f_error,
            count(c.id) FILTER (WHERE c.outcome = 'timeout')::int AS f_timeout,
            count(c.id) FILTER (WHERE c.outcome = 'rate_limited')::int AS f_rate_limited,
            count(c.id) FILTER (WHERE c.outcome = 'ok' AND EXISTS (
              SELECT 1 FROM model_calls p WHERE p.tenant_id = $1 AND p.request_id = c.request_id AND p.id < c.id))::int AS backup_uses,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c.latency_ms))::int AS median_latency_ms,
            sum(c.cost_usd)::float8 AS cost_usd
     FROM tenant_models m
     LEFT JOIN model_calls c ON c.tenant_model_id = m.id AND c.tenant_id = m.tenant_id AND c.created_at >= $2
     WHERE m.tenant_id = $1
     GROUP BY m.id
     ORDER BY CASE m.tier WHEN 'cheap' THEN 0 ELSE 1 END, m.position`,
    [tenantId, since],
  );
  const {
    rows: [{ total }],
  } = await pool.query(
    "SELECT sum(cost_usd)::float8 AS total FROM model_calls WHERE tenant_id = $1 AND created_at >= $2",
    [tenantId, since],
  );
  return {
    total_cost_usd: total as number | null, // estimated provider cost; null when nothing was priced
    models: rows.map(({ f_error, f_timeout, f_rate_limited, ...m }) => ({
      ...m,
      failures: { error: f_error, timeout: f_timeout, rate_limited: f_rate_limited },
    })),
  };
}
