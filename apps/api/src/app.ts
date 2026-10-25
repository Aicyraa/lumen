import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { accountRouter } from "./modules/account/account.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import type { Auth } from "./modules/auth/auth.js";
import { chatHandler } from "./modules/chat/chat.routes.js";
import { devRouter, devVerifyHandler } from "./modules/dev/dev.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { feedbackHandler } from "./modules/feedback/feedback.routes.js";
import { modelsRouter } from "./modules/models/models.routes.js";
import { workspacesRouter } from "./modules/projects/projects.routes.js";
import { requestsRouter } from "./modules/requests/requests.routes.js";
import { usageHandler } from "./modules/usage/usage.routes.js";
import { errorHandler, notFoundHandler, sendError } from "./shared/lib/errors.js";
import { createLimiters } from "./shared/middleware/rateLimit.js";
import { requireApiKey } from "./shared/middleware/requireApiKey.js";
import {
  requireProjectMatch,
  requireSession,
  requireTenant,
} from "./shared/middleware/requireSession.js";
import { loadTenantModels } from "./shared/middleware/tenantModels.js";
import type { Deps } from "./shared/types/types.js";

// Everything is injected so tests can pass a test database and a stubbed RAG client.
export function createApp({
  config,
  pool,
  auth,
  rag,
  log,
  resolveHost,
}: Omit<Deps, "pending"> & { auth: Auth }) {
  const app = express();
  app.set("trust proxy", config.trustProxy); // off unless TRUST_PROXY says how many proxies sit in front
  const pending = new Set<Promise<void>>(); // background ingests still running
  app.locals.idle = () => Promise.allSettled([...pending]);
  app.use(cors({ origin: config.dashboardOrigin, credentials: true }));
  // Resend is throttled per client address, before Better Auth sees it (its own limiter is production-only and keyed by header).
  app.post(
    "/api/auth/send-verification-email",
    rateLimit({
      windowMs: config.verificationResendWindowSeconds * 1000,
      limit: config.verificationResendMax,
      legacyHeaders: false,
      standardHeaders: "draft-7",
      handler: (_req, res) =>
        sendError(res, 429, "rate_limited", "Too many requests. Try again in a minute."),
    }),
  );
  app.use("/api/auth/api-key", requireProjectMatch(auth)); // API keys are managed through Better Auth, not /api/dashboard
  const authHandler = toNodeHandler(auth);
  // Express 5 syntax; must come before express.json() (rule 5). The scope lets the create hooks release only their own lock.
  app.all("/api/auth/*splat", (req, res) => auth.projectLockScope(() => authHandler(req, res)));
  app.use(express.json());
  // Public API: every /v1 route needs a valid key, so unknown paths also answer 401 first.
  const deps = { pool, rag, config, log, pending, resolveHost };
  const limiters = createLimiters(config);
  const llm = [limiters.perTenant, loadTenantModels(deps), limiters.globalCap];
  app.locals.rateLimitUsed = limiters.used;
  const v1 = express.Router();
  v1.use(requireApiKey(auth));
  v1.use("/documents", documentsRouter(deps));
  v1.post("/chat", ...llm, chatHandler(deps));
  v1.post("/feedback", feedbackHandler(deps));
  app.use("/v1", v1);

  // Dashboard API: session cookie, tenant = active organization.
  const dash = express.Router();
  dash.use(requireSession(auth, pool));
  dash.use("/workspaces", workspacesRouter(deps, auth)); // projects of the user; no active project needed
  dash.use("/account", accountRouter(deps)); // the user's own data; no active project needed
  dash.use(requireTenant);
  dash.get("/documents", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.filename, d.status, d.error, s.chunk_count, d.created_at
       FROM documents d JOIN document_stats s ON s.document_id = d.id AND s.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 ORDER BY d.created_at DESC`,
      [req.tenantId],
    );
    res.json({
      documents: rows.map(
        (d: {
          id: string;
          filename: string;
          status: string;
          error: string | null;
          chunk_count: number;
          created_at: Date;
        }) => ({
          document_id: d.id,
          filename: d.filename,
          status: d.status,
          error: d.error,
          chunk_count: d.chunk_count,
          created_at: d.created_at,
        }),
      ),
    });
  });
  dash.get("/usage", usageHandler(deps, limiters.used));
  dash.post("/feedback", feedbackHandler(deps)); // same logic as /v1/feedback; the tenant is the session's organization
  dash.use("/analytics", analyticsRouter(deps));
  dash.use("/requests", requestsRouter(deps));
  dash.use("/documents", documentsRouter(deps));
  dash.use("/models", modelsRouter(deps, limiters.modelTests));
  dash.post("/try", ...llm, chatHandler(deps, { tryIt: true })); // same limiter instance as /v1/chat: one shared counter
  app.use("/api/dashboard", dash);

  if (config.devRoutes) {
    app.post("/dev/api-key", devRouter({ pool, auth, config }));
    app.post("/dev/verify-email", devVerifyHandler({ pool, config }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
