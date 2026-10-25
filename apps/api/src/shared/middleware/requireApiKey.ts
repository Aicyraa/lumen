import type { RequestHandler } from "express";
import type { Auth } from "../../modules/auth/auth.js";
import { ApiError } from "../lib/errors.js";
import "../types/types.js";

// /v1/*: the tenant is the organization that owns the key, never anything from the request body.
export const requireApiKey =
  (auth: Auth): RequestHandler =>
  async (req, _res, next) => {
    const invalid = new ApiError(401, "invalid_api_key", "Missing or invalid API key.");
    const key = req.get("x-api-key");
    if (!key) throw invalid;
    const result = await auth.api.verifyApiKey({ body: { key } }).catch(() => null);
    if (!result?.valid || !result.key?.referenceId) throw invalid;
    req.tenantId = result.key.referenceId;
    req.apiKeyId = result.key.id;
    next();
  };
