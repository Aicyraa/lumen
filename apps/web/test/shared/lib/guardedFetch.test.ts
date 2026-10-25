import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveProjectId } from "../../../src/shared/lib/activeProject";
import { guardedFetch } from "../../../src/shared/lib/guardedFetch";

const stub = (status = 200, body: unknown = {}) => {
  const fn = vi.fn(
    async (_u: unknown, _i?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
};
const header = (fn: ReturnType<typeof stub>) =>
  new Headers(fn.mock.calls[0][1]?.headers).get("x-project-id");

afterEach(() => {
  setActiveProjectId("");
  vi.unstubAllGlobals();
});

describe("guardedFetch X-Project-Id", () => {
  it("is sent on the API key routes", async () => {
    setActiveProjectId("p9");
    const fn = stub();
    await guardedFetch("http://api.test/api/auth/api-key/list?organizationId=p9", {
      method: "GET",
    });
    expect(header(fn)).toBe("p9");
  });
  it("is not sent on other auth routes", async () => {
    setActiveProjectId("p9");
    const fn = stub();
    await guardedFetch("http://api.test/api/auth/get-session");
    expect(header(fn)).toBeNull();
  });
});
