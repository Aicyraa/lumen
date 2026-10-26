import type pg from "pg";
import { describe, expect, it } from "vitest";
import { type Pool, withTx } from "../../../src/shared/db/pool.js";

// A fake pool whose one client records every statement and release; failOn makes the matching statement reject.
const fake = (failOn?: string) => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql === failOn) throw new Error(`${sql} failed`);
    },
    release: () => calls.push("release"),
  };
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, calls, client: client as unknown as pg.PoolClient };
};

describe("withTx", () => {
  it("begins, runs the callback on that client, commits and releases", async () => {
    const { pool, calls, client } = fake();
    const out = await withTx(pool, async (c) => {
      expect(c).toBe(client);
      await c.query("WORK");
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toEqual(["BEGIN", "WORK", "COMMIT", "release"]);
  });

  it("rolls back, rethrows the callback's error and releases exactly once", async () => {
    const { pool, calls } = fake();
    const boom = new Error("boom");
    await expect(
      withTx(pool, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(calls).toEqual(["BEGIN", "ROLLBACK", "release"]);
  });

  it("still throws the original error and releases when the ROLLBACK itself fails", async () => {
    const { pool, calls } = fake("ROLLBACK");
    const boom = new Error("boom");
    await expect(
      withTx(pool, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(calls.filter((c) => c === "release")).toHaveLength(1);
    expect(calls).toEqual(["BEGIN", "ROLLBACK", "release"]);
  });
});
