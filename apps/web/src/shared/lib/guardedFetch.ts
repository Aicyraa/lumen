// An answer that is not JSON means the request never reached the Lumen API (for example Vite's index.html on the
// web origin). Treat it like a failed connection instead of letting HTML be parsed as a session or data.
export const guardedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status !== 204 && !(res.headers.get("content-type") ?? "").includes("json"))
    throw new TypeError("The server did not answer with JSON");
  return res;
};
