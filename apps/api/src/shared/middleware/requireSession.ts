import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";
import type { Auth } from "../../modules/auth/auth.js";
import type { Pool } from "../db/pool.js";
import { ApiError } from "../lib/errors.js";
import "../types/types.js";

// /api/dashboard/*: the user comes from the session. The tenant is the session's active project, but only while the user is
// still a member of it; a stale or foreign value leaves req.tenantId unset (requireTenant then refuses).
export const requireSession =
  (auth: Auth, pool: Pool): RequestHandler =>
  async (req, _res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new ApiError(401, "unauthorized", "Sign in required.");
    req.userId = session.user.id;
    const active = (session.session as { activeOrganizationId?: string | null })
      .activeOrganizationId;
    if (active) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
        [session.user.id, active],
      );
      if (rowCount) req.tenantId = active;
    }
    next();
  };

// The dashboard may send X-Project-Id with the project it believes is active. If the session has switched since (another tab),
// the request is refused before any data is read or written, so the page never mixes two projects.
const projectMismatch = () =>
  new ApiError(409, "project_mismatch", "The active project changed. Reload the page.");

// Everything that reads or writes a project's data sits behind this (only /workspaces and the session itself do not).
export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.tenantId) throw new ApiError(403, "no_active_project", "Choose a project first.");
  const claimed = req.get("x-project-id");
  if (claimed !== undefined && claimed !== req.tenantId) throw projectMismatch();
  next();
};

// Same check for Better Auth's API key routes, which carry no req.tenantId: compares with the session's active project.
export const requireProjectMatch =
  (auth: Auth): RequestHandler =>
  async (req, _res, next) => {
    const claimed = req.get("x-project-id");
    if (claimed === undefined) return next();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const active = (session?.session as { activeOrganizationId?: string | null } | undefined)
      ?.activeOrganizationId;
    if (session && claimed !== active) throw projectMismatch(); // no session: Better Auth answers 401 itself
    next();
  };
