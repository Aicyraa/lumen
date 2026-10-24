import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../../modules/auth/auth.js";
import type { Pool } from "../db/pool.js";
import { ApiError } from "../lib/errors.js";
import "../types/types.js";

// /api/dashboard/*: the user comes from the session. The tenant is the session's active project, but only while the user is
// still a member of it; a stale or foreign value leaves req.tenantId unset (requireTenant then refuses).
export const requireSession = (auth: Auth, pool: Pool): RequestHandler => async (req, _res, next) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new ApiError(401, "unauthorized", "Sign in required.");
  req.userId = session.user.id;
  const active = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  if (active) {
    const { rowCount } = await pool.query(`SELECT 1 FROM member WHERE "userId" = $1 AND "organizationId" = $2`, [session.user.id, active]);
    if (rowCount) req.tenantId = active;
  }
  next();
};

// Everything that reads or writes a project's data sits behind this (only /workspaces and the session itself do not).
export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.tenantId) throw new ApiError(403, "no_active_project", "Choose a project first.");
  next();
};
