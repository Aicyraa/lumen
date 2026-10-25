import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import type { Config } from "../../shared/config/config.js";
import type { Pool } from "../../shared/db/pool.js";

// Taken for the whole sweep so that when several API processes start together only one of them sweeps.
export const SWEEP_LOCK_NAME = "lumen:sweep-interrupted";

// At startup: a restart loses any background ingest, so rows still 'processing' past the cutoff are failed.
// Runs per organization so every documents/chunks statement still carries tenant_id (rule 1).
export async function sweepInterrupted({
  pool,
  config,
  log,
}: {
  pool: Pool;
  config: Pick<Config, "interruptedIngestAfterSeconds" | "uploadDir">;
  log: Pick<Logger, "info" | "warn">;
}): Promise<number> {
  // A session-level lock lives on one connection, so that connection is held for the sweep and the lock released on it.
  const lock = await pool.connect();
  try {
    const { rows } = await lock.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [
      SWEEP_LOCK_NAME,
    ]);
    if (!rows[0].ok) {
      log.info({}, "interrupted-ingest sweep skipped: another process is sweeping");
      return 0;
    }
    try {
      return await sweep({ pool, config, log });
    } finally {
      await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [SWEEP_LOCK_NAME]);
    }
  } finally {
    lock.release();
  }
}

async function sweep({
  pool,
  config,
  log,
}: {
  pool: Pool;
  config: Pick<Config, "interruptedIngestAfterSeconds" | "uploadDir">;
  log: Pick<Logger, "info" | "warn">;
}): Promise<number> {
  const { rows: orgs } = await pool.query("SELECT id FROM organization");
  let swept = 0;
  for (const { id: tenantId } of orgs) {
    const { rows } = await pool.query(
      `UPDATE documents SET status = 'failed', error = 'ingest interrupted'
       WHERE tenant_id = $1 AND status = 'processing' AND created_at < now() - make_interval(secs => $2) RETURNING id`,
      [tenantId, config.interruptedIngestAfterSeconds],
    );
    // shortcut: an ingest still running in Python when Express died could commit chunks after this; not re-checked
    for (const { id } of rows) {
      await pool.query("DELETE FROM chunks WHERE tenant_id = $1 AND document_id = $2", [
        tenantId,
        id,
      ]);
    }
    swept += rows.length;
  }
  // uploaded files that were never cleaned up because the process died
  const cutoff = Date.now() - config.interruptedIngestAfterSeconds * 1000;
  for (const name of await readdir(config.uploadDir).catch(() => [])) {
    const path = join(config.uploadDir, name);
    const info = await stat(path).catch(() => null); // gone since readdir (an ingest just finished with it): nothing to do
    if (info && info.mtimeMs < cutoff) await unlink(path).catch(() => {});
  }
  log.info({ swept }, "interrupted-ingest sweep done");
  return swept;
}
