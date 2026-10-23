import type { Server } from "node:http";
import express from "express";

// A stand-in for a tenant's LLM provider (OpenAI-compatible /chat/completions). Listens on loopback;
// tests reach it as http://localhost:PORT/v1 (allowed outside production).
export interface ProviderCall { auth: string | undefined; body: Record<string, unknown>; path: string }
export async function startProviderStub(goodKey = "sk-good-key-1234") {
  const calls: ProviderCall[] = [];
  const state = { hang: false, status: 0 };
  const app = express();
  app.use(express.json());
  app.post("/v1/chat/completions", (req, res) => {
    calls.push({ auth: req.get("authorization"), body: req.body, path: req.path });
    if (state.hang) return;
    if (state.status) return res.status(state.status).json({ error: { message: `provider says ${req.get("authorization")}` } });
    if (req.get("authorization") !== `Bearer ${goodKey}`) return res.status(401).json({ error: { message: "Incorrect API key provided: " + (req.get("authorization") ?? "") } });
    res.json({ choices: [{ message: { role: "assistant", content: "ok" } }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
  });
  const server = await new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const port = (server.address() as { port: number }).port;
  return {
    port, goodKey, calls, state,
    url: `http://localhost:${port}/v1`,
    reset: () => { calls.length = 0; state.hang = false; state.status = 0; },
    close: () => { server.closeAllConnections(); server.close(); },
  };
}
