import { MemoryStore, rateLimit } from "express-rate-limit";
import { sendError } from "../errors.js";

const handler = (req, res) => sendError(res, 429, "rate_limited", "Too many requests. Try again in a minute.");

// One limiter instance (so one counter) is mounted on both /v1/chat and /api/dashboard/try.
// shortcut: counters live in this process's memory, so run one API instance or move to a shared store.
export function createLimiters(config) {
  const store = new MemoryStore();
  const perTenant = rateLimit({
    windowMs: 60_000, limit: config.ratePerMinute, store, handler, legacyHeaders: false, standardHeaders: "draft-7",
    keyGenerator: (req) => req.tenantId, // runs after auth, so this is always the authenticated tenant
  });
  const globalCap = rateLimit({
    windowMs: 60_000, limit: config.globalLlmCapPerMinute, handler, legacyHeaders: false, standardHeaders: false,
    keyGenerator: () => "all-tenants",
  });
  // The usage meter reads the same store the limiter writes.
  const used = async (tenantId) => (await store.get(tenantId))?.totalHits ?? 0;
  return { llm: [perTenant, globalCap], used };
}
