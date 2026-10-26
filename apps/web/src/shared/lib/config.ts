// The one place that decides where the API lives. Both the auth client and the dashboard fetch wrapper use apiBase,
// so neither can silently fall back to the web page's own origin (where Vite answers every path with index.html).
export function resolveApiBase(env: { VITE_API_URL?: string; DEV?: boolean }): string {
  if (env.VITE_API_URL?.trim() === "/") return ""; // explicit: same origin, the host proxies /api and /v1 to the API
  const set = env.VITE_API_URL?.trim().replace(/\/+$/, "");
  if (set) return set;
  if (env.DEV) return "http://localhost:3000"; // dev default: the API's own default port
  throw new Error("VITE_API_URL is not set. Set it to the API's URL when building the dashboard.");
}

let base = "";
let error: string | null = null;
try {
  base = resolveApiBase(import.meta.env);
} catch (e) {
  error = (e as Error).message; // shown by ConfigMissing instead of the app
}

export const apiBase = base;
export const configError = error;
export const isDev = !!import.meta.env.DEV;
