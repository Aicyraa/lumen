import pg from "pg";

// connectionTimeoutMillis: a starved pool errors after that long instead of hanging every request (0 = wait forever, used by scripts).
export const createPool = (connectionString: string, connectionTimeoutMillis = 0): pg.Pool => new pg.Pool({ connectionString, connectionTimeoutMillis });
export type Pool = pg.Pool;
