import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { requireSession } from "./middleware/requireSession.js";
import { createLimiters } from "./middleware/rateLimit.js";
import { requireApiKey } from "./middleware/requireApiKey.js";
import { devRouter } from "./routes/dev.js";
import { chatHandler } from "./routes/chat.js";
import { feedbackHandler } from "./routes/feedback.js";
import { documentsRouter } from "./routes/documents.js";
import { errorHandler, notFoundHandler } from "./errors.js";

// Everything is injected so tests can pass a test database and a stubbed RAG client.
export function createApp({ config, pool, auth, rag, log }) {
  const app = express();
  const pending = new Set(); // background ingests still running
  app.locals.idle = () => Promise.allSettled([...pending]);
  app.use(cors({ origin: config.dashboardOrigin, credentials: true }));
  app.all("/api/auth/*splat", toNodeHandler(auth)); // Express 5 syntax; must come before express.json() (rule 5)
  app.use(express.json());
  // Public API: every /v1 route needs a valid key, so unknown paths also answer 401 first.
  const deps = { pool, rag, config, log, pending };
  const limiters = createLimiters(config);
  app.locals.rateLimitUsed = limiters.used;
  const v1 = express.Router();
  v1.use(requireApiKey(auth));
  v1.use("/documents", documentsRouter(deps));
  v1.post("/chat", ...limiters.llm, chatHandler(deps));
  v1.post("/feedback", feedbackHandler(deps));
  app.use("/v1", v1);

  // Dashboard API: session cookie, tenant = active organization.
  const dash = express.Router();
  dash.use(requireSession(auth));
  dash.get("/documents", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, filename, status, error, chunk_count, created_at FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC", [req.tenantId]);
    res.json({ documents: rows.map((d) => ({ document_id: d.id, filename: d.filename, status: d.status, error: d.error, chunk_count: d.chunk_count, created_at: d.created_at })) });
  });
  dash.use("/documents", documentsRouter(deps));
  dash.post("/try", ...limiters.llm, chatHandler(deps)); // same limiter instance as /v1/chat: one shared counter
  app.use("/api/dashboard", dash);

  if (!config.production) app.post("/dev/api-key", devRouter({ pool, auth, config }));

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
