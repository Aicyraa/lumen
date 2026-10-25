import pg from "pg";

// connectionTimeoutMillis: a starved pool errors after that long instead of hanging every request (0 = wait forever, used by scripts).
// The error listener matters: an idle client that Postgres drops emits 'error' on the pool, and with no listener that crashes the process.
export const createPool = (
  connectionString: string,
  connectionTimeoutMillis = 0,
  log: { error: (obj: object, msg: string) => void } = {
    error: (obj, msg) => console.error(msg, obj),
  },
): pg.Pool => {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis });
  pool.on("error", (err) => log.error({ err: err.message }, "idle database client error"));
  return pool;
};
export type Pool = pg.Pool;
