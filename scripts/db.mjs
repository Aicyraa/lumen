// pnpm db:up | db:down | db:psql | db:migrate | db:status
// Local development database: pgvector in a Podman or Docker container (port 5433). Reads infra/.env.
// Migrations: every infra/sql/NNN_*.sql in order, each applied once (recorded in schema_migrations).
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, readAppEnv } from "./lib.mjs";

const NAME = "lumen-db";
const infra = readAppEnv("infra");
const have = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
const engine = have("podman") ? "podman" : have("docker") ? "docker" : null;
const run = (args, opts = {}) => spawnSync(engine, args, { stdio: "inherit", ...opts });
const need = () => { if (!engine) { console.error("Install podman or docker."); process.exit(1); } };

function up() {
  need();
  if (spawnSync(engine, ["start", NAME], { stdio: "ignore" }).status === 0) return console.log(`${NAME} started`);
  if (!infra.POSTGRES_PASSWORD) { console.error("Set POSTGRES_PASSWORD in infra/.env (pnpm env:init)."); process.exit(1); }
  run(["volume", "create", "lumen_db_data"], { stdio: "ignore" });
  const r = run(["run", "-d", "--name", NAME, "-p", "5433:5432", "-e", `POSTGRES_PASSWORD=${infra.POSTGRES_PASSWORD}`, "-e", "POSTGRES_DB=lumen", "-v", "lumen_db_data:/var/lib/postgresql/data", "docker.io/pgvector/pgvector:pg16"]);
  process.exit(r.status ?? 1);
}
const down = () => { need(); process.exit(run(["stop", NAME]).status ?? 1); };
const psql = () => { need(); process.exit(run(["exec", "-it", NAME, "psql", "-U", "postgres", "-d", "lumen"]).status ?? 1); };

async function client() {
  const url = readAppEnv("apps/api").DATABASE_URL;
  if (!url) { console.error("DATABASE_URL missing in apps/api/.env"); process.exit(1); }
  const pg = createRequire(join(ROOT, "apps/api/package.json"))("pg");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}
const files = () => readdirSync(join(ROOT, "infra/sql")).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

async function migrate(statusOnly = false) {
  const c = await client();
  try {
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    // Databases created before this tracker: the first files already ran, so record them instead of re-running.
    const legacy = (await c.query("SELECT to_regclass('public.documents') AS t")).rows[0].t;
    if (!done.size && legacy) for (const f of files()) { await c.query("INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING", [f]); done.add(f); console.log(`baseline ${f}`); }
    for (const f of files()) {
      if (done.has(f)) { console.log(`${statusOnly ? "applied" : "skip"}    ${f}`); continue; }
      if (statusOnly) { console.log(`pending    ${f}`); continue; }
      await c.query("BEGIN");
      try { await c.query(readFileSync(join(ROOT, "infra/sql", f), "utf8")); await c.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]); await c.query("COMMIT"); console.log(`applied    ${f}`); }
      catch (e) { await c.query("ROLLBACK"); console.error(`FAILED ${f}: ${e.message}`); process.exit(1); }
    }
  } finally { await c.end(); }
}

const cmd = process.argv[2];
if (cmd === "up") up();
else if (cmd === "down") down();
else if (cmd === "psql") psql();
else if (cmd === "migrate") await migrate();
else if (cmd === "status") await migrate(true);
else { console.error("usage: db.mjs up|down|psql|migrate|status"); process.exit(2); }
