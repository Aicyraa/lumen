import { flagProjectMismatch, withProjectId } from "./activeProject";

// An answer that is not JSON means the request never reached the Lumen API (for example Vite's index.html on the
// web origin). Treat it like a failed connection instead of letting HTML be parsed as a session or data.
// This is also the Better Auth client's fetch, so API key calls carry X-Project-Id and notice a project mismatch.
export const guardedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const res = await fetch(input, {
    ...init,
    headers: withProjectId(url, new Headers(init?.headers)),
  });
  if (res.status !== 204 && !(res.headers.get("content-type") ?? "").includes("json"))
    throw new TypeError("The server did not answer with JSON");
  if (res.status === 409) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error?.code === "project_mismatch") flagProjectMismatch();
  }
  return res;
};
