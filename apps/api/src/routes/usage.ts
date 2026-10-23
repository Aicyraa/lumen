import type { RequestHandler } from "express";
import { MONTH_START_SQL } from "../lib/range.js";
import type { Deps } from "../types/types.js";
import "../types/types.js";

// Sidebar meters. Every max comes from the environment; requests_per_minute.used is the rate limiter's own counter.
export const usageHandler = ({ pool, config }: Deps, rateUsed: (tenantId: string) => Promise<number>): RequestHandler => async (req, res) => {
  const [docs, month, perMinute] = await Promise.all([
    pool.query("SELECT count(*)::int AS n FROM documents WHERE tenant_id = $1", [req.tenantId]),
    pool.query(`SELECT count(*)::int AS n FROM request_logs WHERE tenant_id = $1 AND created_at >= ${MONTH_START_SQL}`, [req.tenantId]),
    rateUsed(req.tenantId),
  ]);
  res.json({
    documents: { used: docs.rows[0].n, max: config.maxDocuments },
    requests_per_minute: { used: perMinute, max: config.ratePerMinute },
    requests_this_month: { used: month.rows[0].n, max: config.maxRequestsPerMonth },
  });
};
