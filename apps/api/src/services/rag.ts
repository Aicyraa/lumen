// Client for the private Python service. Errors keep the service's error.code; nothing from the body is logged.
import { openAsBlob } from "node:fs";
import type { Config } from "../config/config.js";
import { ApiError } from "../lib/errors.js";

export interface ChatSource {
  document_id: string;
  chunk_id: number;
  score: number;
}
export interface ChatResponse {
  request_id: string;
  answer: string;
  sources: ChatSource[];
  route: { model_tier: "cheap" | "expensive" | "none"; k: number; escalated: boolean; difficulty: number; top_score: number | null };
  usage: { tokens_in: number; tokens_out: number; cost_usd: number | null; latency_ms: number };
}

// An error answer from the Python service, carrying its error.code.
export class RagError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type RagClient = ReturnType<typeof createRagClient>;

export function createRagClient(config: Pick<Config, "ragUrl" | "internalSecret" | "ingestTimeoutMs" | "queryTimeoutMs" | "ragDeleteTimeoutMs">) {
  const headers = { "x-internal-secret": config.internalSecret };

  async function call<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    let res: Response;
    try {
      res = await fetch(config.ragUrl + path, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const why = (err as Error | undefined)?.name === "TimeoutError" ? "timed out" : "is unavailable";
      throw new ApiError(502, "provider_error", `The answer service ${why}. Try again shortly.`);
    }
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    if (!res.ok) throw new RagError(res.status, body?.error?.code ?? "rag_error", body?.error?.message ?? `rag service returned ${res.status}`);
    return body as T;
  }

  return {
    async ingest(tenantId: string, documentId: string, filePath: string, filename: string) {
      const form = new FormData();
      form.set("tenant_id", tenantId);
      form.set("document_id", documentId);
      form.set("file", await openAsBlob(filePath), filename);
      return call<{ chunk_count: number }>("/internal/ingest", { method: "POST", body: form }, config.ingestTimeoutMs);
    },
    query: (tenantId: string, query: string, sessionId?: string) =>
      call<ChatResponse>("/internal/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, query, session_id: sessionId }),
      }, config.queryTimeoutMs),
    remove: (tenantId: string, documentId: string) =>
      call<{ deleted_chunks: number }>(`/internal/documents/${documentId}?tenant_id=${encodeURIComponent(tenantId)}`, { method: "DELETE" }, config.ragDeleteTimeoutMs),
  };
}
