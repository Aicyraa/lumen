import type { Request, Response } from "express";
import { MemoryStore, type Options, type RateLimitInfo, rateLimit } from "express-rate-limit";
import type { Config } from "../config/config.js";
import { ApiError, sendError } from "../lib/errors.js";

const handler = (_req: Request, res: Response) =>
  sendError(res, 429, "rate_limited", "Too many requests. Try again in a minute.");

// One limiter instance (so one counter) is mounted on both /v1/chat and /api/dashboard/try.
// The global cap must run after loadTenantModels (it needs to know whose key the call will use).
// shortcut: counters live in this process's memory, so run one API instance or move to a shared store.
export function createLimiters(
  config: Pick<
    Config,
    "ratePerMinute" | "globalLlmCapPerMinute" | "modelTestRatePerMinute" | "uploadRatePerMinute"
  >,
) {
  const store = new MemoryStore();
  // keyGenerator runs after auth, so this is always the authenticated tenant.
  const perTenantLimiter = (limit: number, options: Partial<Options> = {}) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      handler,
      legacyHeaders: false,
      standardHeaders: "draft-7",
      keyGenerator: (req) => req.tenantId,
      ...options,
    });
  const perTenant = perTenantLimiter(config.ratePerMinute, { store });
  const globalCap = rateLimit({
    windowMs: 60_000,
    limit: config.globalLlmCapPerMinute,
    handler,
    legacyHeaders: false,
    standardHeaders: false,
    keyGenerator: () => "all-tenants",
    skip: (req) => !!req.tenantModels, // the cap protects the shared default key; a tenant's own keys are never throttled by it
  });
  // Test & save calls the tenant's own provider with the tenant's key: its own, much tighter counter.
  const modelTests = perTenantLimiter(config.modelTestRatePerMinute);
  // Starting an upload writes a file and starts an ingest: one counter per tenant for /v1/documents and the dashboard together.
  const uploads = perTenantLimiter(config.uploadRatePerMinute, {
    handler: (req, _res, next) => {
      const wait = Math.max(
        1,
        Math.ceil(
          (((req as Request & { rateLimit: RateLimitInfo }).rateLimit.resetTime?.getTime() ?? 0) -
            Date.now()) /
            1000,
        ),
      );
      next(new ApiError(429, "upload_rate_limited", "Too many uploads. Try again shortly.", wait));
    },
  });
  // The usage meter reads the same store the limiter writes.
  // The store keeps an entry after its window ends until a sweep, so an ended window counts as 0.
  const used = async (tenantId: string) => {
    const hit = await store.get(tenantId);
    return hit?.resetTime && hit.resetTime.getTime() > Date.now() ? hit.totalHits : 0;
  };
  return { perTenant, globalCap, modelTests, uploads, used };
}
