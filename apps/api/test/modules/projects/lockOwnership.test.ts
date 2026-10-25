import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

// The per-user create lock lets go of a holder that takes longer than projectCreateLockMs. That late holder's own release
// must not release the lock of whoever took over, or a third create would run alongside the second.
let ctx: Ctx, u: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({
    maxProjectsPerUser: 10,
    projectCreateLockMs: 400,
    ratePerMinute: 1000,
    globalLlmCapPerMinute: 1000,
  });
  u = await ctx.createTenant("lock");
});
afterAll(async () => {
  vi.restoreAllMocks();
  await ctx.close();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const create = (name: string) =>
  request(ctx.app).post("/api/dashboard/workspaces").set("cookie", u.cookie).send({ name });

describe("project creation lock", () => {
  it("a create that outlives the lock TTL cannot release the lock of the create that took over", async () => {
    // The tenants insert happens inside the critical section (the lock is released after it).
    // Creates run in arrival order A, B, C: A stalls past the TTL, B takes over and stalls less than its own TTL, C starts at once.
    const stalls = [600, 300, 0];
    const events: string[] = [];
    let call = 0;
    const real = ctx.pool.query.bind(ctx.pool) as (...a: unknown[]) => unknown;
    vi.spyOn(ctx.pool, "query").mockImplementation((async (...args: unknown[]) => {
      if (!/INSERT INTO tenants/.test(String(args[0]))) return real(...args);
      const i = call++;
      events.push(`start ${"ABC"[i]}`);
      await sleep(stalls[i]);
      events.push(`end ${"ABC"[i]}`);
      return real(...args);
    }) as never);
    const a = create("A");
    await sleep(40);
    const b = create("B");
    await sleep(40);
    const c = create("C");
    const results = await Promise.all([a, b, c]);
    vi.restoreAllMocks();
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    // C must not start while B is still inside the critical section
    expect(events.indexOf("start C")).toBeGreaterThan(events.indexOf("end B"));
  });
});
