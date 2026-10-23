import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

interface Tunables {
  ingestTimeoutMs: number;
  interruptedIngestAfterSeconds: number;
  globalLlmCapPerMinute: number;
  uploadMaxBytes: number;
  queryMaxChars: number;
  uploadDir: string;
  requestsPageSizeDefault: number;
  requestsPageSizeMax: number;
  queryTimeoutMs: number;
  ragDeleteTimeoutMs: number;
  modelTestTimeoutMs: number;
  snippetMaxChars: number;
  passageMaxChars: number;
  unansweredScoreBelow: number;
  unansweredPageSize: number;
  modelAttemptsMax: number;
  rateLimitHeadersMax: number;
  modelTestMaxTokens: number;
  endpointResponseMaxBytes: number;
  modelIdMaxChars: number;
  endpointUrlMaxChars: number;
  apiKeyMaxChars: number;
  apiKeyMinChars: number;
  providerNameMaxChars: number;
  sessionIdMaxChars: number;
  maxPricePerMillion: number;
  endpointGuardCacheTtlMs: number;
}
const tunables: Tunables = JSON.parse(readFileSync(new URL("../../config.json", import.meta.url), "utf8"));
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
  MODEL_KEY_ENCRYPTION_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/), // 32 bytes as hex
});

export interface OAuthCredentials {
  clientId?: string;
  clientSecret?: string;
}
export type Config = Tunables & {
  databaseUrl: string;
  authSecret: string;
  authUrl: string;
  dashboardOrigin: string;
  internalSecret: string;
  ragUrl: string;
  maxDocuments: number;
  ratePerMinute: number;
  maxRequestsPerMonth: number;
  google: OAuthCredentials;
  github: OAuthCredentials;
  devRoutes: boolean;
  modelKeySecret: string;
  production: boolean;
};

// Throws naming the missing variables (never their values) so the server refuses to start.
export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const parsed = required.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`missing or invalid environment variables: ${names.join(", ")}`);
  }
  const e = parsed.data;
  // Tunables: config.json defaults, each overridable by an upper-snake env var of the same name.
  const t: Tunables = { ...tunables };
  for (const k of Object.keys(t) as (keyof Tunables)[]) {
    const v = env[k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()];
    if (v) (t as unknown as Record<string, number | string>)[k] = typeof t[k] === "number" ? Number(v) : v;
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
    modelKeySecret: e.MODEL_KEY_ENCRYPTION_SECRET,
    production: env.NODE_ENV === "production",
    devRoutes: env.NODE_ENV === "development", // dev-only routes are an explicit opt-in
    ...t,
    uploadDir: resolve(new URL("../..", import.meta.url).pathname, t.uploadDir), // relative to apps/api
    ...overrides,
  };
}
