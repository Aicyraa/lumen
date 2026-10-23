import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { Request, Response } from "express";
import express from "express";
import multer from "multer";

// A stand-in for the Python service with the same paths, secret check and error shape.
// Tests change `stub.handlers.*` to simulate failures and read `stub.calls` to see what Express sent.
export interface StubCall {
  name: "ingest" | "query" | "delete";
  body: Record<string, unknown>;
  query: Record<string, string>;
  params: Record<string, string>;
  file?: Express.Multer.File;
}
interface Attempt { provider: string; model_id: string; tenant_model_id?: string | null; endpoint_url?: string; api_key?: string }
type Handler = (call: StubCall) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

export async function startRagStub(secret: string) {
  const calls: StubCall[] = [];
  const handlers: Record<StubCall["name"], Handler> = {
    ingest: () => ({ status: 200, body: { chunk_count: 3 } }),
    // Mirrors the contract the Python service must follow (see the Phase 3B report): with `models` it answers
    // from the first model of the cheap tier (else expensive, else fallback) and reports one attempt;
    // without `models` it reports the dev default model (tier 'default'); with include_snippets each source
    // carries filename and snippet. `attempts` and per-attempt `rate_limits` are internal: Express strips them.
    query: ({ body }) => {
      const models = body.models as Record<string, Attempt[]> | undefined;
      const tiers = ["cheap", "expensive", "fallback"] as const;
      const tier = tiers.find((t) => models?.[t]?.length);
      const m = tier ? models![tier][0] : undefined;
      const sources: Record<string, unknown>[] = [{ document_id: randomUUID(), chunk_id: 12, score: 0.71 }];
      if (body.include_snippets) for (const src of sources) Object.assign(src, { filename: "stub-from-python.txt", snippet: "A short passage from the document." });
      return {
        status: 200,
        body: {
          request_id: randomUUID(),
          answer: "Stub answer [1]",
          sources,
          route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0.0, top_score: 0.71 },
          usage: { tokens_in: 812, tokens_out: 96, cost_usd: null, latency_ms: 820 },
          attempts: [{
            provider: m?.provider ?? "openai_compatible", model_id: m?.model_id ?? "env-default",
            tenant_model_id: m?.tenant_model_id ?? null, tier: tier ?? "default",
            outcome: "ok", tokens_in: 812, tokens_out: 96, latency_ms: 700, rate_limits: null,
          }],
        },
      };
    },
    delete: () => ({ status: 200, body: { deleted_chunks: 3 } }),
  };
  const defaults = { ...handlers };
  const reset = () => { Object.assign(handlers, defaults); calls.length = 0; };
  const app = express();
  app.use((req, res, next) => {
    if (req.get("x-internal-secret") !== secret) {
      return res.status(401).json({ error: { code: "unauthorized", message: "bad secret" } });
    }
    next();
  });
  const run = (name: StubCall["name"]) => async (req: Request, res: Response) => {
    const call: StubCall = { name, body: req.body, query: req.query as Record<string, string>, params: req.params as Record<string, string>, file: req.file };
    calls.push(call);
    const out = await handlers[name](call);
    res.status(out.status).json(out.body);
  };
  app.post("/internal/ingest", multer().single("file"), run("ingest"));
  app.post("/internal/query", express.json(), run("query"));
  app.delete("/internal/documents/:id", run("delete"));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, calls, handlers, reset, close: () => server.close() };
}
