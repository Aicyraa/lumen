import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectMismatched,
  resetProjectMismatch,
  setActiveProjectId,
} from "../../../src/shared/lib/activeProject";
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

describe("api() X-Project-Id", () => {
  const sentHeaders = async (path: string) => {
    const fetchMock = vi.fn(
      async () => new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await api(path);
    return new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
  };
  afterEach(() => setActiveProjectId(""));

  it.each(["documents", "models", "models/usage", "requests", "analytics/summary", "usage", "try"])(
    "is sent on /api/dashboard/%s",
    async (p) => {
      setActiveProjectId("p9");
      expect((await sentHeaders(`/api/dashboard/${p}`)).get("x-project-id")).toBe("p9");
    },
  );
  it.each(["/api/dashboard/workspaces", "/api/dashboard/workspaces/p9", "/api/dashboard/account"])(
    "is not sent on %s",
    async (p) => {
      setActiveProjectId("p9");
      expect((await sentHeaders(p)).get("x-project-id")).toBeNull();
    },
  );
  it("is not sent before a project is active", async () => {
    expect((await sentHeaders("/api/dashboard/documents")).get("x-project-id")).toBeNull();
  });
});

describe("api() project_mismatch", () => {
  afterEach(resetProjectMismatch);
  it("flags the tab when the API answers 409 project_mismatch, and not for other 409s", async () => {
    respond(409, { error: { code: "conflict", message: "m" } });
    await fail();
    expect(projectMismatched()).toBe(false);
    respond(409, { error: { code: "project_mismatch", message: "m" } });
    await fail();
    expect(projectMismatched()).toBe(true);
  });
  it("is cleared when another project becomes active", () => {
    respond(409, { error: { code: "project_mismatch", message: "m" } });
    return fail().then(() => {
      setActiveProjectId("other");
      expect(projectMismatched()).toBe(false);
    });
  });
});
