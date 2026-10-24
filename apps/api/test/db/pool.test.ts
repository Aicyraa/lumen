import { describe, expect, it } from "vitest";
import { createPool } from "../../src/shared/db/pool.js";
import { testConfig } from "../helpers/env.js";

describe("createPool", () => {
  it("fails a query with a timeout error instead of waiting forever when every connection is busy", async () => {
    const pool = createPool(testConfig().databaseUrl, 200);
    const held = await Promise.all(Array.from({ length: 10 }, () => pool.connect())); // the default pool size
    try {
      const started = Date.now();
      await expect(pool.query("SELECT 1")).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(2000);
    } finally { held.forEach((c) => c.release()); await pool.end(); }
  });
});
