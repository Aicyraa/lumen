import { randomUUID } from "node:crypto";
import pino from "pino";
import { createAuth } from "../../src/auth.js";
import { createApp } from "../../src/app.js";
import { createPool } from "../../src/db.js";
import { createRagClient } from "../../src/rag.js";
import { testConfig } from "./env.js";
import { startRagStub } from "./ragStub.js";

// Builds the real app against lumen_test and a stubbed RAG service.
export async function makeCtx(overrides = {}) {
  const base = testConfig();
  const stub = await startRagStub(base.internalSecret);
  const config = { ...base, ragUrl: stub.url, ...overrides };
  const pool = createPool(config.databaseUrl);
  const auth = createAuth({ pool, config });
  const log = pino({ level: "silent" });
  const rag = createRagClient(config);
  const app = createApp({ config, pool, auth, rag, log });
  const tenants = [];

  // A real sign-up, then an organization-owned API key through the plugin.
  async function createTenant(label = "t") {
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

  async function close() {
    for (const t of tenants) {
      await pool.query("DELETE FROM request_logs WHERE tenant_id = $1", [t]);
      await pool.query("DELETE FROM documents WHERE tenant_id = $1", [t]);
    }
    stub.close();
    await app.locals.idle(); // background ingests must finish before the pool closes
    await pool.end();
  }

  return { app, pool, auth, config, stub, rag, createTenant, close };
}
