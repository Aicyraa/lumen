// Provider adapter. All four providers are reached the way the Python service reaches them: an
// OpenAI-compatible POST {endpoint_url}/chat/completions with a Bearer key (Anthropic and Google both
// publish OpenAI-compatible endpoints). The key goes only into this request and never into a message.
import type { Config } from "../../shared/config/config.js";
import { ApiError } from "../../shared/lib/errors.js";
import { EndpointError, guardedPost, type GuardOptions } from "../../shared/lib/endpointGuard.js";

export interface ModelTarget { provider: string; model_id: string; endpoint_url: string; api_key: string }

const why = (status: number) =>
  status === 401 || status === 403 ? "The provider rejected the API key."
    : status === 404 ? "The provider does not know this model or endpoint path."
    : status === 429 ? "The provider rate-limited the test call. Try again shortly."
    : `The provider answered with status ${status}.`;

// One tiny completion. Throws ApiError 422 model_test_failed (never including the key or the provider's body).
export async function testCompletion(m: ModelTarget, config: Pick<Config, "production" | "modelTestTimeoutMs" | "modelTestMaxTokens" | "endpointResponseMaxBytes">, resolve?: GuardOptions["resolve"]): Promise<void> {
  // OpenAI's newer models reject max_tokens; other OpenAI-compatible servers still expect it.
  const limit = m.provider === "openai" ? { max_completion_tokens: config.modelTestMaxTokens } : { max_tokens: config.modelTestMaxTokens };
  let res;
  try {
    res = await guardedPost(`${m.endpoint_url.replace(/\/+$/, "")}/chat/completions`, {
      production: config.production, resolve, timeoutMs: config.modelTestTimeoutMs, maxBodyBytes: config.endpointResponseMaxBytes,
      headers: { "content-type": "application/json", authorization: `Bearer ${m.api_key}` },
      body: JSON.stringify({ model: m.model_id, messages: [{ role: "user", content: "Reply with OK." }], ...limit }),
    });
  } catch (err) {
    const msg = err instanceof EndpointError ? err.message : "Could not reach the endpoint.";
    throw new ApiError(422, "model_test_failed", msg);
  }
  if (res.status < 200 || res.status >= 300) throw new ApiError(422, "model_test_failed", why(res.status));
}
