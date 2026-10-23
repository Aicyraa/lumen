import pg from "pg";

export const createPool = (connectionString: string): pg.Pool => new pg.Pool({ connectionString });
export type Pool = pg.Pool;
