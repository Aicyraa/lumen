// Runs the rag-service for a Tailscale Funnel: production mode, 127.0.0.1 only, settings from apps/rag-service/.env.funnel.
// `--check` validates the file and exits. Never prints a value. See infra/TAILSCALE.md.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, parseEnv } from "./lib.mjs";

const dir = join(ROOT, "apps/rag-service");
const file = join(dir, ".env.funnel");
const python = join(dir, ".venv/bin/python");
const fail = (msg) => (console.error(`rag-funnel: ${msg}`), process.exit(1));

if (!existsSync(file)) fail("apps/rag-service/.env.funnel is missing. Create it as described in infra/TAILSCALE.md, step 4.");
if (!existsSync(python)) fail("apps/rag-service/.venv is missing. Run `pnpm --filter @lumen/rag-service bootstrap` first.");

const env = parseEnv(file);
const dbHost = /@([^/:?]+)/.exec(env.DATABASE_URL ?? "")?.[1] ?? "";
if (!env.DATABASE_URL) fail("DATABASE_URL is missing in .env.funnel (the Supabase session pooler string).");
if (["localhost", "127.0.0.1", "::1"].includes(dbHost)) fail("DATABASE_URL points at this machine; the funnel setup must use the Supabase database.");
if ((env.INTERNAL_SECRET ?? "").length < 32) fail("INTERNAL_SECRET is missing or shorter than 32 characters (openssl rand -hex 32).");
if (process.argv.includes("--check")) (console.log("rag-funnel: .env.funnel looks complete"), process.exit(0));

// production and loopback are not negotiable here: the funnel is the only way in, and it reaches 127.0.0.1
const child = spawn(python, ["-m", "app.cli", "serve"], {
  cwd: dir,
  stdio: "inherit",
  env: { ...process.env, ...env, NODE_ENV: "production", RAG_HOST: "127.0.0.1", RAG_PORT: env.RAG_PORT || "8000" },
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
