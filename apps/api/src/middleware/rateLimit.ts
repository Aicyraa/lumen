import { MemoryStore, rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";
import type { Config } from "../config/config.js";
import "../types/types.js";
import { sendError } from "../lib/errors.js";

const handler = (_req: Request, res: Response) => sendError(res, 429, "rate_limited", "Too many requests. Try again in a minute.");

// One limiter instance (so one counter) is mounted on both /v1/chat and /api/dashboard/try.
// The global cap must run after loadTenantModels (it needs to know whose key the call will use).
// shortcut: counters live in this process's memory, so run one API instance or move to a shared store.
export function createLimiters(config: Pick<Config, "ratePerMinute" | "globalLlmCapPerMinute">) {
  const store = new MemoryStore();
  const perTenant = rateLimit({
    windowMs: 60_000, limit: config.ratePerMinute, store, handler, legacyHeaders: false, standardHeaders: "draft-7",
    keyGenerator: (req) => req.tenantId, // runs after auth, so this is always the authenticated tenant
  });
  const globalCap = rateLimit({
    windowMs: 60_000, limit: config.globalLlmCapPerMinute, handler, legacyHeaders: false, standardHeaders: false,
    keyGenerator: () => "all-tenants",
    skip: (req) => !!req.tenantModels, // the cap protects the shared default key; a tenant's own keys are never throttled by it
  });
  // The usage meter reads the same store the limiter writes.
  const used = async (tenantId: string) => (await store.get(tenantId))?.totalHits ?? 0;
  return { perTenant, globalCap, used };
}
