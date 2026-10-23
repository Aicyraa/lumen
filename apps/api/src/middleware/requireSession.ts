import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../auth/auth.js";
import { ApiError } from "../errors.js";
import "../types.js";

// /api/dashboard/*: the tenant is the session's active organization (set at sign-in, never from the request).
export const requireSession = (auth: Auth): RequestHandler => async (req, _res, next) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  const tenantId = (session?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId;
  if (!session || !tenantId) throw new ApiError(401, "unauthorized", "Sign in required.");
  req.tenantId = tenantId;
  req.userId = session.user.id;
  next();
};
