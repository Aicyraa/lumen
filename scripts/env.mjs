// pnpm env:init  -> create each app's .env from its .env.example when missing
// pnpm env:check -> verify required variables and cross-app consistency (prints names and OK/MISSING only)
import { copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ENV_DIRS, ROOT, readAppEnv } from "./lib.mjs";

const REQUIRED = {
  "apps/api": [
    "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DASHBOARD_ORIGIN", "INTERNAL_SECRET",
    "RAG_SERVICE_URL", "MAX_DOCUMENTS_PER_TENANT", "RATE_LIMIT_PER_MINUTE", "MAX_REQUESTS_PER_MONTH",
    "MAX_PROJECTS_PER_USER", "MODEL_KEY_ENCRYPTION_SECRET",
  ],
  "apps/rag-service": ["DATABASE_URL", "INTERNAL_SECRET"],
  "apps/web": [],
  infra: ["POSTGRES_PASSWORD"],
};
const same = (a, b) => a && b && createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");

function init() {
  for (const dir of ENV_DIRS) {
    const env = join(ROOT, dir, ".env");
    const example = join(ROOT, dir, ".env.example");
    if (existsSync(env)) console.log(`${dir}/.env exists`);
    else if (existsSync(example)) { copyFileSync(example, env); console.log(`${dir}/.env created from .env.example: fill it in`); }
    else console.log(`${dir}: no .env.example`);
  }
}

function check() {
  let bad = 0;
  const envs = Object.fromEntries(ENV_DIRS.map((d) => [d, readAppEnv(d)]));
  for (const [dir, names] of Object.entries(REQUIRED)) {
    if (!existsSync(join(ROOT, dir, ".env"))) { console.log(`MISSING FILE ${dir}/.env`); bad++; continue; }
    for (const n of names) if (!envs[dir][n]) { console.log(`MISSING ${dir}: ${n}`); bad++; }
  }
  const api = envs["apps/api"], rag = envs["apps/rag-service"];
  for (const n of ["DATABASE_URL", "INTERNAL_SECRET"]) {
    const ok = same(api[n], rag[n]);
    console.log(`${n} api == rag-service: ${ok ? "OK" : "MISMATCH"}`);
    if (!ok) bad++;
  }
  if (api.BETTER_AUTH_SECRET && api.BETTER_AUTH_SECRET.length < 32) { console.log("api BETTER_AUTH_SECRET shorter than 32"); bad++; }
  if (api.MODEL_KEY_ENCRYPTION_SECRET && !/^[0-9a-fA-F]{64}$/.test(api.MODEL_KEY_ENCRYPTION_SECRET)) { console.log("api MODEL_KEY_ENCRYPTION_SECRET is not 64 hex characters"); bad++; }
  console.log(bad ? `env:check found ${bad} problem(s)` : "env:check OK");
  process.exit(bad ? 1 : 0);
}

({ init, check })[process.argv[2]]?.() ?? (console.error("usage: env.mjs init|check"), process.exit(2));
