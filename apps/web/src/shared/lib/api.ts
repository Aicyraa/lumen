// Thin fetch wrapper for /api/dashboard/*: the Better Auth session cookie rides along (credentials: include).
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

import { apiBase } from "./config";

export async function api<T = void>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string") headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(apiBase + path, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server.");
  }
  if (res.status === 204) return undefined as T;
  // HTML or text instead of JSON: the request did not reach the API (wrong base URL)
  if (!(res.headers.get("content-type") ?? "").includes("json"))
    throw new ApiError(0, "network_error", "Cannot reach the server.");
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      body?.error?.code ?? "error",
      body?.error?.message ?? `Request failed (${res.status}).`,
    );
  return body as T;
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
