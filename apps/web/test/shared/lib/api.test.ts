import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../../src/shared/lib/api";

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json", ...headers },
        }),
    ),
  );
const fail = async () => (await api("/x").catch((e) => e)) as ApiError;

afterEach(() => vi.unstubAllGlobals());

describe("api() provider rate limits", () => {
  it("keeps code and retry_after_seconds from the error body", async () => {
    respond(
      429,
      {
        error: {
          code: "provider_rate_limited",
          message: "Try again in about 2 minutes.",
          retry_after_seconds: 120,
        },
      },
      { "retry-after": "999" },
    );
    const e = await fail();
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("provider_rate_limited");
    expect(e.retryAfterSeconds).toBe(120);
  });

  it("falls back to the Retry-After header when the body has no number", async () => {
    respond(
      429,
      { error: { code: "provider_rate_limited", message: "m" } },
      { "retry-after": "90" },
    );
    expect((await fail()).retryAfterSeconds).toBe(90);
  });

  it("ignores a Retry-After that is not whole seconds, and other errors carry none", async () => {
    respond(
      429,
      { error: { code: "rate_limited", message: "m" } },
      { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" },
    );
    expect((await fail()).retryAfterSeconds).toBeUndefined();
    respond(502, { error: { code: "provider_error", message: "m" } });
    expect((await fail()).retryAfterSeconds).toBeUndefined();
  });
});
