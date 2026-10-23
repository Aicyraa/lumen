import { timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
import type { Auth } from "../auth/auth.js";
import type { Deps } from "../types/types.js";
import { ApiError } from "../lib/errors.js";

// DEV ONLY (not mounted in production): mint an API key for an existing user's organization, without a browser.
// Guarded by the internal secret so a stray dev server is not an open key dispenser.
function checkSecret(req: Request, config: Pick<Deps["config"], "internalSecret">) {
  const given = Buffer.from(req.get("x-internal-secret") ?? "");
  const expected = Buffer.from(config.internalSecret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new ApiError(401, "unauthorized", "Missing or invalid X-Internal-Secret.");
}

// DEV ONLY: mark an email + password user's address verified, so e2e runs can sign in without a mailbox.
export const devVerifyHandler = ({ pool, config }: Pick<Deps, "pool" | "config">): RequestHandler => async (req, res) => {
  checkSecret(req, config);
  const { email } = z.object({ email: z.email() }).parse(req.body);
  const { rowCount } = await pool.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email.toLowerCase()]);
  if (!rowCount) throw new ApiError(404, "not_found", "No user with that email. Sign up first.");
  res.status(204).end();
};

export function devRouter({ pool, auth, config }: Pick<Deps, "pool" | "config"> & { auth: Auth }): RequestHandler {
  return async (req, res) => {
    checkSecret(req, config);
    const { email } = z.object({ email: z.email() }).parse(req.body);
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, m."organizationId" AS org FROM "user" u JOIN member m ON m."userId" = u.id
       WHERE u.email = $1 ORDER BY m."createdAt" LIMIT 1`, [email.toLowerCase()]);
    if (!rows[0]) throw new ApiError(404, "not_found", "No user with that email. Sign up first.");
    const key = await auth.api.createApiKey({ body: { name: "dev key", organizationId: rows[0].org, userId: rows[0].user_id } });
    res.json({ tenant_id: rows[0].org, api_key: key.key });
  };
}
