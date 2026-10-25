// Creates/updates Better Auth's own tables (user, session, account, organization, member, apikey...).
import "../src/shared/config/env.js";
import { readFileSync } from "node:fs";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../src/modules/auth/auth.js";
import type { Config } from "../src/shared/config/config.js";
import { loadConfig } from "../src/shared/config/config.js";
import { createPool } from "../src/shared/db/pool.js";

export async function migrateAuth(config: Config) {
  const pool = createPool(config.databaseUrl);
  const auth = createAuth({ pool, config });
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  // RLS and no Data API access on Better Auth's tables; Supabase gets the same file after its Better Auth tables.
  await pool.query(
    readFileSync(
      new URL("../../../infra/sql/auth/001_auth_tables_rls.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrateAuth(loadConfig());
  console.log("better-auth tables up to date");
}
