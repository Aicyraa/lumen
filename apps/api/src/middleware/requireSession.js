import { fromNodeHeaders } from "better-auth/node";
import { ApiError } from "../errors.js";

// /api/dashboard/*: the tenant is the session's active organization (set at sign-in, never from the request).
export const requireSession = (auth) => async (req, res, next) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  const tenantId = session?.session?.activeOrganizationId;
  if (!tenantId) throw new ApiError(401, "unauthorized", "Sign in required.");
  req.tenantId = tenantId;
  req.userId = session.user.id;
  next();
};
