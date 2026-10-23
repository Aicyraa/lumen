import { readFileSync } from "node:fs";
import "../src/env.js";
import { createPool } from "../src/db.js";
import { migrateAuth } from "../scripts/migrate.js";
import { testConfig } from "./helpers/env.js";

// Tests only ever touch lumen_test: create it if missing, apply the app SQL and Better Auth's tables.
export default async function setup() {
  const config = testConfig();
  const admin = createPool(config.databaseUrl.replace(/\/lumen_test$/, "/postgres"));
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'lumen_test'");
  if (!rowCount) await admin.query("CREATE DATABASE lumen_test");
  await admin.end();
  const pool = createPool(config.databaseUrl);
  const { rows } = await pool.query("SELECT to_regclass('public.documents') AS t");
  if (!rows[0].t) await pool.query(readFileSync(new URL("../../../infra/sql/001_app_tables.sql", import.meta.url), "utf8"));
  await pool.end();
  await migrateAuth(config);
}
