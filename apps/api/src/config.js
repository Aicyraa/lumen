import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const tunables = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const posInt = z.coerce.number().int().positive();
const required = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  DASHBOARD_ORIGIN: z.string().min(1),
  INTERNAL_SECRET: z.string().min(1),
  RAG_SERVICE_URL: z.string().url(),
  MAX_DOCUMENTS_PER_TENANT: posInt,
  RATE_LIMIT_PER_MINUTE: posInt,
  MAX_REQUESTS_PER_MONTH: posInt,
});

// Throws naming the missing variables (never their values) so the server refuses to start.
export function loadConfig(env = process.env, overrides = {}) {
  const parsed = required.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path[0]))];
    throw new Error(`missing or invalid environment variables: ${names.join(", ")}`);
  }
  const e = parsed.data;
  // Tunables: config.json defaults, each overridable by an upper-snake env var of the same name.
  const t = { ...tunables };
  for (const k of Object.keys(t)) {
    const v = env[k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()];
    if (v) t[k] = typeof t[k] === "number" ? Number(v) : v;
  }
  return {
    databaseUrl: e.DATABASE_URL,
    authSecret: e.BETTER_AUTH_SECRET,
    authUrl: e.BETTER_AUTH_URL,
    dashboardOrigin: e.DASHBOARD_ORIGIN,
    internalSecret: e.INTERNAL_SECRET,
    ragUrl: e.RAG_SERVICE_URL.replace(/\/$/, ""),
    maxDocuments: e.MAX_DOCUMENTS_PER_TENANT,
    ratePerMinute: e.RATE_LIMIT_PER_MINUTE,
    maxRequestsPerMonth: e.MAX_REQUESTS_PER_MONTH,
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
    devRoutes: env.NODE_ENV === "development", // dev-only routes are an explicit opt-in
    ...t,
    uploadDir: resolve(new URL("..", import.meta.url).pathname, t.uploadDir), // relative to apps/api
    ...overrides,
  };
}
