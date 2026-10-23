import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import type { Config } from "../../src/config/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { encryptSecret, maskKey } from "../../src/lib/crypto.js";
import { createAuth } from "../../src/auth/auth.js";
import { createApp } from "../../src/app.js";
import { createPool } from "../../src/db/pool.js";
import { createRagClient } from "../../src/services/rag.js";
import { testConfig } from "./env.js";
import { startRagStub } from "./ragStub.js";

// Builds the real app against lumen_test and a stubbed RAG service.
export interface Tenant {
  email: string;
  userId: string;
  tenantId: string;
  apiKey: string;
  cookie: string;
}
export type Ctx = Awaited<ReturnType<typeof makeCtx>>;

export async function makeCtx(overrides: Partial<Config> = {}) {
  const base = testConfig();
  const stub = await startRagStub(base.internalSecret);
  const config = { ...base, ragUrl: stub.url, ...overrides };
  const pool = createPool(config.databaseUrl);
  const auth = createAuth({ pool, config });
  const logLines: string[] = []; // everything the app logs, so tests can prove no key or snippet is in it
  const log = createLogger(new Writable({ write(chunk, _enc, cb) { logLines.push(String(chunk)); cb(); } }), "debug");
  const rag = createRagClient(config);
  // Fake DNS: every name is public except `localhost` (the provider stub) and names a test points elsewhere.
  const dns = new Map<string, string>();
  const dnsCalls: string[] = [];
  const resolveHost = async (host: string) => {
    dnsCalls.push(host);
    return [{ address: dns.get(host) ?? (host === "localhost" ? "127.0.0.1" : "93.184.216.34"), family: 4 }];
  };
  const app = createApp({ config, pool, auth, rag, log, resolveHost });
  const tenants: string[] = [];

  // A real sign-up, then an organization-owned API key through the plugin.
  async function createTenant(label = "t"): Promise<Tenant> {
    const email = `${label}-${randomUUID()}@example.test`;
    const signUp = await auth.api.signUpEmail({ body: { email, password: "correct-horse-battery", name: label } });
    const { rows } = await pool.query(`SELECT "organizationId" AS org FROM member WHERE "userId" = $1`, [signUp.user.id]);
    const tenantId = rows[0].org;
    const key = await auth.api.createApiKey({ body: { name: "test", organizationId: tenantId, userId: signUp.user.id } });
    tenants.push(tenantId);
    // a dashboard session cookie, from a real email + password sign-in
    const res = await auth.api.signInEmail({ body: { email, password: "correct-horse-battery" }, asResponse: true });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { email, userId: signUp.user.id, tenantId, apiKey: key.key, cookie };
  }

  // Inserts a model row directly (no network), encrypted like the real route does.
  async function seedModel(t: Tenant, tier: string, model_id: string, key = "sk-seeded-key-0001", endpoint = "https://api.example.test/v1"): Promise<string> {
    const { rows } = await pool.query(
      `INSERT INTO tenant_models (tenant_id, tier, position, provider, model_id, endpoint_url, api_key_encrypted, key_hint)
       VALUES ($1, $2, (SELECT COALESCE(max(position) + 1, 0) FROM tenant_models WHERE tenant_id = $1 AND tier = $2), 'openai_compatible', $3, $4, $5, $6) RETURNING id`,
      [t.tenantId, tier, model_id, endpoint, encryptSecret(key, config.modelKeySecret, t.tenantId), maskKey(key)]);
    return rows[0].id;
  }

  async function close() {
    for (const t of tenants) {
      await pool.query("DELETE FROM request_logs WHERE tenant_id = $1", [t]);
      await pool.query("DELETE FROM model_calls WHERE tenant_id = $1", [t]);
      await pool.query("DELETE FROM tenant_models WHERE tenant_id = $1", [t]);
      await pool.query("DELETE FROM documents WHERE tenant_id = $1", [t]);
    }
    stub.close();
    await app.locals.idle(); // background ingests must finish before the pool closes
    await pool.end();
  }

  return { app, pool, auth, config, stub, rag, logLines, dns, dnsCalls, seedModel, createTenant, close };
}
