import { readdirSync } from "node:fs";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { until, uploadFile } from "../../helpers/uploads.js";

// Per-tenant upload rate and a cap on ingests running at once. Both answer 429 with Retry-After.
let ctx: Ctx, a: Tenant, b: Tenant;
const release: Array<() => void> = [];
beforeAll(async () => {
  ctx = await makeCtx({
    maxDocuments: 100,
    uploadRatePerMinute: 6,
    maxConcurrentIngests: 2,
    ingestLimitRetryAfterSeconds: 7,
    ingestTimeoutMs: 20_000,
  });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});
afterEach(async () => {
  for (const r of release.splice(0)) r();
  await ctx.app.locals.idle();
  ctx.stub.reset();
});

const upload = (t: Tenant, via: "v1" | "dash" = "v1") => uploadFile(ctx, t, { via });
const hang = () => {
  ctx.stub.handlers.ingest = () =>
    new Promise((resolve) =>
      release.push(() => resolve({ status: 200, body: { chunk_count: 1 } })),
    );
};
const started = async (n: number) => {
  await until(() => release.length >= n, { ms: 20 });
  expect(release.length).toBe(n); // that many ingests reached the (fake) rag-service
};
const filesOf = (t: Tenant) =>
  readdirSync(ctx.config.uploadDir).filter((n) => n.startsWith(`${t.tenantId}__`));

describe("concurrent ingests per tenant", () => {
  it("429 ingest_limit with Retry-After when the cap is reached; no row and no file left; other tenants unaffected; recovers", async () => {
    hang();
    expect((await upload(a)).status).toBe(202);
    expect((await upload(a, "dash")).status).toBe(202);
    const before = (
      await ctx.pool.query("SELECT count(*)::int n FROM documents WHERE tenant_id = $1", [
        a.tenantId,
      ])
    ).rows[0].n;
    const over = await upload(a);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("ingest_limit");
    expect(over.headers["retry-after"]).toBe("7");
    expect(over.body.error.retry_after_seconds).toBe(7);
    expect(
      (
        await ctx.pool.query("SELECT count(*)::int n FROM documents WHERE tenant_id = $1", [
          a.tenantId,
        ])
      ).rows[0].n,
    ).toBe(before);
    expect(filesOf(a)).toHaveLength(2); // the two running ingests' files, not the refused one
    expect((await upload(b)).status).toBe(202);
    await started(3);
    for (const r of release.splice(0)) r();
    await ctx.app.locals.idle();
    ctx.stub.reset();
    expect((await upload(a)).status).toBe(202);
  });

  it("a stuck 'processing' row older than the interrupted cutoff does not count", async () => {
    await ctx.pool.query("DELETE FROM documents WHERE tenant_id = $1", [b.tenantId]);
    for (let i = 0; i < 2; i++)
      await ctx.pool.query(
        "INSERT INTO documents (tenant_id, filename, status, created_at) VALUES ($1, 'old.md', 'processing', now() - interval '1 day')",
        [b.tenantId],
      );
    expect((await upload(b)).status).toBe(202);
  });
});

describe("upload rate per tenant", () => {
  it("429 upload_rate_limited with Retry-After after UPLOAD_RATE_PER_MINUTE, one counter across /v1 and the dashboard, per tenant", async () => {
    const c = await ctx.createTenant("rate");
    const d = await ctx.createTenant("rate2");
    for (let i = 0; i < 3; i++) expect((await upload(c)).status).toBe(202);
    for (let i = 0; i < 3; i++) expect((await upload(c, "dash")).status).toBe(202);
    const over = await upload(c);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("upload_rate_limited");
    expect(Number(over.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(Number(over.headers["retry-after"])).toBeLessThanOrEqual(60);
    expect(over.body.error.retry_after_seconds).toBe(Number(over.headers["retry-after"]));
    expect((await upload(d)).status).toBe(202);
    const read = await request(ctx.app).get("/api/dashboard/documents").set("cookie", c.cookie);
    expect(read.status).toBe(200); // only POST counts
  });
});
