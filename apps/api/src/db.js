import pg from "pg";

export const createPool = (connectionString) => new pg.Pool({ connectionString });
