import { Router } from "express";
import { MONTH_START_SQL } from "../../shared/lib/range.js";
import { ownedProjectCount } from "../../shared/services/projects.js";
import type { Deps } from "../../shared/types/types.js";
import "../../shared/types/types.js";

// The signed-in user's own account data. Session only: no active project needed.
// Every statement is keyed by the session user (req.userId) or by the project ids derived from that user's memberships (rule 1).
export function accountRouter({ pool, config }: Deps) {
  const r = Router();
  r.get("/", async (req, res) => {
    const mine = `SELECT "organizationId" FROM member WHERE "userId" = $1`;
    const [user, providers, owned, totals] = await Promise.all([
      pool.query(
        `SELECT name, email, "emailVerified" AS email_verified, image, "createdAt" AS created_at FROM "user" WHERE id = $1`,
        [req.userId],
      ),
      pool.query(
        `SELECT CASE "providerId" WHEN 'credential' THEN 'email' ELSE "providerId" END AS provider, "createdAt" AS linked_at
         FROM account WHERE "userId" = $1 ORDER BY "createdAt", id`,
        [req.userId],
      ),
      ownedProjectCount(pool, req.userId!),
      pool.query(
        `SELECT (SELECT count(*)::int FROM documents WHERE tenant_id IN (${mine})) AS documents,
                (SELECT count(*)::int FROM request_logs WHERE tenant_id IN (${mine}) AND created_at >= ${MONTH_START_SQL}) AS requests_this_month,
                (SELECT count(*)::int FROM apikey WHERE "referenceId" IN (${mine})) AS api_keys,
                (SELECT count(*)::int FROM tenant_models WHERE tenant_id IN (${mine})) AS models`,
        [req.userId],
      ),
    ]);
    res.json({
      user: user.rows[0],
      providers: providers.rows,
      projects: { owned, max: config.maxProjectsPerUser },
      totals: totals.rows[0],
    });
  });
  return r;
}
