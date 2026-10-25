import { readdirSync, readFileSync } from "node:fs";
import "../src/shared/config/env.js";
import { migrateAuth } from "../scripts/migrate.js";
import { createPool } from "../src/shared/db/pool.js";
import { testConfig, testDbName } from "./helpers/env.js";

// Tests only ever touch the test database (lumen_test unless LUMEN_TEST_DB says otherwise): create it if missing, apply the numbered app SQL and Better Auth's tables.
export default async function setup() {
  const config = testConfig();
  const db = testDbName();
  if (!/^[a-z0-9_]+$/.test(db)) throw new Error("LUMEN_TEST_DB must be letters, digits and underscores");
  const admin = createPool(config.databaseUrl.replace(new RegExp(`/${db}$`), "/postgres"));
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if (!rowCount) await admin.query(`CREATE DATABASE ${db}`);
  await admin.end();
  const pool = createPool(config.databaseUrl);
  // Every numbered migration in order, the same files `pnpm db:migrate` applies. 001 is not re-runnable; the rest are.
  const dir = new URL("../../../infra/sql/", import.meta.url);
  const { rows } = await pool.query("SELECT to_regclass('public.documents') AS t");
  for (const f of readdirSync(dir)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort())
    if (f !== "001_app_tables.sql" || !rows[0].t)
      await pool.query(readFileSync(new URL(f, dir), "utf8"));
  await pool.end();
  await migrateAuth(config);
}
