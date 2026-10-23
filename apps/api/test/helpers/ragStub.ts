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
type Handler = (call: StubCall) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

export async function startRagStub(secret: string) {
  const calls: StubCall[] = [];
  const handlers: Record<StubCall["name"], Handler> = {
    ingest: () => ({ status: 200, body: { chunk_count: 3 } }),
    query: () => ({
      status: 200,
      body: {
        request_id: randomUUID(),
        answer: "Stub answer [1]",
        sources: [{ document_id: randomUUID(), chunk_id: 12, score: 0.71 }],
        route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0.0, top_score: 0.71 },
        usage: { tokens_in: 812, tokens_out: 96, cost_usd: null, latency_ms: 820 },
      },
    }),
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
