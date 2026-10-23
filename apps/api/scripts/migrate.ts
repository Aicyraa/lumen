// Creates/updates Better Auth's own tables (user, session, account, organization, member, apikey...).
import "../src/config/env.js";
import { getMigrations } from "better-auth/db/migration";
import type { Config } from "../src/config/config.js";
import { loadConfig } from "../src/config/config.js";
import { createPool } from "../src/db/pool.js";
import { createAuth } from "../src/auth/auth.js";

export async function migrateAuth(config: Config) {
  const pool = createPool(config.databaseUrl);
  const auth = createAuth({ pool, config });
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrateAuth(loadConfig());
  console.log("better-auth tables up to date");
}
