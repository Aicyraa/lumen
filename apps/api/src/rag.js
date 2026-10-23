// Client for the private Python service. Errors keep the service's error.code; nothing from the body is logged.
import { openAsBlob } from "node:fs";
import { ApiError } from "./errors.js";

export function createRagClient(config) {
  const headers = { "x-internal-secret": config.internalSecret };

  async function call(path, init, timeoutMs) {
    let res;
    try {
      res = await fetch(config.ragUrl + path, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ApiError(502, "provider_error", "The answer service is unavailable. Try again shortly.");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error(body?.error?.message ?? `rag service returned ${res.status}`);
      e.status = res.status;
      e.code = body?.error?.code ?? "rag_error";
      throw e;
    }
    return body;
  }

  return {
    async ingest(tenantId, documentId, filePath, filename) {
      const form = new FormData();
      form.set("tenant_id", tenantId);
      form.set("document_id", documentId);
      form.set("file", await openAsBlob(filePath), filename);
      return call("/internal/ingest", { method: "POST", body: form }, config.ingestTimeoutMs);
    },
    query: (tenantId, query, sessionId) =>
      call("/internal/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, query, session_id: sessionId }),
      }, config.queryTimeoutMs),
    remove: (tenantId, documentId) =>
      call(`/internal/documents/${documentId}?tenant_id=${encodeURIComponent(tenantId)}`, { method: "DELETE" }, config.ragDeleteTimeoutMs),
  };
}
