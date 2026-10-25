import { describe, expect, it } from "vitest";
import { createPool } from "../../../src/shared/db/pool.js";
import { testConfig } from "../../helpers/env.js";

describe("createPool", () => {
  it("fails a query with a timeout error instead of waiting forever when every connection is busy", async () => {
    const pool = createPool(testConfig().databaseUrl, 200);
    const held = await Promise.all(Array.from({ length: 10 }, () => pool.connect())); // the default pool size
    try {
      const started = Date.now();
      await expect(pool.query("SELECT 1")).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(2000);
    } finally {
      for (const c of held) c.release();
      await pool.end();
    }
  });

  it("logs an error on an idle client instead of crashing the process", async () => {
    const errors: unknown[][] = [];
    const pool = createPool(testConfig().databaseUrl, 200, {
      error: (...a: unknown[]) => errors.push(a),
    });
    try {
      expect(() => pool.emit("error", new Error("terminating connection"))).not.toThrow();
      expect(JSON.stringify(errors)).toContain("terminating connection");
    } finally {
      await pool.end();
    }
  });

  it("does not crash without a logger either", async () => {
    const pool = createPool(testConfig().databaseUrl);
    try {
      expect(() => pool.emit("error", new Error("idle client error"))).not.toThrow();
    } finally {
      await pool.end();
    }
  });
});
