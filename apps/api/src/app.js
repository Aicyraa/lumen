import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { requireApiKey } from "./middleware/requireApiKey.js";
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
  const v1 = express.Router();
  v1.use(requireApiKey(auth));
  v1.use("/documents", documentsRouter(deps));
  v1.post("/chat", chatHandler(deps));
  v1.post("/feedback", feedbackHandler(deps));
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
