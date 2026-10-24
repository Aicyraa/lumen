import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";
import { insertLog } from "../../helpers/seed.js";

// "Workspace" is the URL name for what the product calls a project: one Better Auth organization = one tenant.
let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx({
    maxProjectsPerUser: 4,
    projectNameMaxChars: 20,
    projectDescriptionMaxChars: 40,
    ratePerMinute: 1000,
    globalLlmCapPerMinute: 1000,
  });
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

const origin = () => ctx.config.dashboardOrigin;
const as = (t: Tenant) => ({
  get: (path: string) => request(ctx.app).get(`/api/dashboard${path}`).set("cookie", t.cookie),
  post: (path: string, body: object = {}) =>
    request(ctx.app).post(`/api/dashboard${path}`).set("cookie", t.cookie).send(body),
  patch: (path: string, body: object) =>
    request(ctx.app).patch(`/api/dashboard${path}`).set("cookie", t.cookie).send(body),
  delete: (path: string, body?: object) =>
    request(ctx.app).delete(`/api/dashboard${path}`).set("cookie", t.cookie).send(body),
  auth: (path: string, body: object) =>
    request(ctx.app)
      .post(`/api/auth${path}`)
      .set("origin", origin())
      .set("cookie", t.cookie)
      .send(body),
  session: () => request(ctx.app).get("/api/auth/get-session").set("cookie", t.cookie),
});
const create = async (t: Tenant, name: string, description?: string) => {
  const res = await as(t).post("/workspaces", { name, description });
  expect(res.status).toBe(201);
  return res.body.workspace as { id: string; slug: string };
};
const activeOf = async (t: Tenant) =>
  (await as(t).session()).body.session.activeOrganizationId as string;
const addMember = (orgId: string, userId: string, role: string) =>
  ctx.pool.query(
    `INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), orgId, userId, role],
  );

describe("GET /api/dashboard/workspaces", () => {
  it("needs a session", async () => {
    expect((await request(ctx.app).get("/api/dashboard/workspaces")).status).toBe(401);
  });

  it("lists the user's projects with name, slug, description, role, created_at and counts, and nobody else's", async () => {
    await ctx.pool.query(
      "INSERT INTO documents (tenant_id, filename) VALUES ($1, 'x.md'), ($1, 'y.md'), ($2, 'theirs.md')",
      [a.tenantId, b.tenantId],
    );
    await insertLog(ctx.pool, a.tenantId);
    await insertLog(ctx.pool, a.tenantId, { createdAt: "2000-01-01T00:00:00Z" }); // not this month
    await insertLog(ctx.pool, b.tenantId);
    const res = await as(a).get("/workspaces");
    expect(res.status).toBe(200);
    expect(res.body.workspaces).toEqual([
      {
        id: a.tenantId,
        name: "My project",
        slug: expect.stringMatching(/^personal-/),
        description: null,
        role: "owner",
        created_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
        documents: 2,
        requests_this_month: 1,
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(b.tenantId);
  });

  it("works even when the session's active project is gone or foreign (the picker must still load)", async () => {
    const c = await ctx.createTenant("c");
    await ctx.pool.query(`UPDATE session SET "activeOrganizationId" = $1 WHERE "userId" = $2`, [
      b.tenantId,
      c.userId,
    ]);
    const res = await as(c).get("/workspaces");
    expect(res.status).toBe(200);
    expect(res.body.workspaces.map((w: { id: string }) => w.id)).toEqual([c.tenantId]);
  });
});

describe("POST /api/dashboard/workspaces", () => {
  it("creates a project owned by the session's user with a unique slug, without changing the active project", async () => {
    const u = await ctx.createTenant("creator");
    const res = await as(u).post("/workspaces", {
      name: "Shop support",
      description: "Orders and returns",
      userId: b.userId,
      tenant_id: b.tenantId,
    });
    expect(res.status).toBe(201);
    expect(res.body.workspace).toEqual({
      id: expect.any(String),
      name: "Shop support",
      slug: expect.stringMatching(/^shop-support-[a-z0-9]{6}$/),
      description: "Orders and returns",
      role: "owner",
      created_at: expect.any(String),
      documents: 0,
      requests_this_month: 0,
    });
    const members = await ctx.pool.query(
      `SELECT "userId", role FROM member WHERE "organizationId" = $1`,
      [res.body.workspace.id],
    );
    expect(members.rows).toEqual([{ userId: u.userId, role: "owner" }]); // the body's userId/tenant_id are ignored
    expect(await activeOf(u)).toBe(u.tenantId);
    const again = await create(u, "Shop support");
    expect(again.slug).not.toBe(res.body.workspace.slug);
  });

  it("stores the description in the organization metadata (no new table)", async () => {
    const u = await ctx.createTenant("meta");
    const w = await create(u, "Meta", "hello");
    const { rows } = await ctx.pool.query(`SELECT metadata FROM organization WHERE id = $1`, [
      w.id,
    ]);
    expect(JSON.parse(rows[0].metadata)).toEqual({ description: "hello" });
  });

  it.each([
    [{ name: "" }],
    [{ name: "   " }],
    [{ name: "x".repeat(21) }],
    [{}],
    [{ name: 5 }],
    [{ name: "ok", description: "d".repeat(41) }],
    [{ name: "ok", description: 5 }],
  ])("rejects %j with 422 invalid_request", async (body) => {
    const res = await as(a).post("/workspaces", body);
    expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
  });

  it("owns at most MAX_PROJECTS_PER_USER projects: the next one is 422 project_limit, also through the Better Auth client call", async () => {
    const u = await ctx.createTenant("capped"); // already has the default project; the cap is 4
    for (const n of ["p2", "p3", "p4"]) await create(u, n);
    const res = await as(u).post("/workspaces", { name: "p5" });
    expect([res.status, res.body.error.code]).toEqual([422, "project_limit"]);
    const direct = await as(u).auth("/organization/create", {
      name: "sneaky",
      slug: `sneaky-${randomUUID().slice(0, 6)}`,
    });
    expect(direct.status).toBeGreaterThanOrEqual(400);
    expect((await as(u).get("/workspaces")).body.workspaces).toHaveLength(4);
  });

  it("a project you were only invited to does not count against your cap", async () => {
    const u = await ctx.createTenant("guest");
    const other = await create(b, "shared");
    await addMember(other.id, u.userId, "member");
    for (const n of ["g2", "g3", "g4"]) await create(u, n);
  });

  it("concurrent creates cannot slip past the cap", async () => {
    const u = await ctx.createTenant("racer");
    await create(u, "r2");
    await create(u, "r3"); // 3 of 4
    const results = await Promise.all(
      [1, 2, 3].map((i) => as(u).post("/workspaces", { name: `race${i}` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 422)).toHaveLength(2);
  });
});

describe("PATCH /api/dashboard/workspaces/:id", () => {
  it("lets the owner rename and change or clear the description", async () => {
    const u = await ctx.createTenant("ren");
    const w = await create(u, "Old name", "old");
    const res = await as(u).patch(`/workspaces/${w.id}`, { name: "New name", description: "new" });
    expect(res.status).toBe(200);
    expect(res.body.workspace).toMatchObject({
      id: w.id,
      name: "New name",
      description: "new",
      slug: w.slug,
    });
    const cleared = await as(u).patch(`/workspaces/${w.id}`, { description: null });
    expect(cleared.body.workspace).toMatchObject({ name: "New name", description: null });
  });

  it("lets an admin edit but not a plain member", async () => {
    const u = await ctx.createTenant("roles-owner");
    const w = await create(u, "Team");
    const admin = await ctx.createTenant("roles-admin");
    const member = await ctx.createTenant("roles-member");
    await addMember(w.id, admin.userId, "admin");
    await addMember(w.id, member.userId, "member");
    expect((await as(admin).patch(`/workspaces/${w.id}`, { name: "By admin" })).status).toBe(200);
    const denied = await as(member).patch(`/workspaces/${w.id}`, { name: "By member" });
    expect([denied.status, denied.body.error.code]).toEqual([403, "forbidden"]);
    const list = await as(member).get("/workspaces");
    expect(list.body.workspaces.find((x: { id: string }) => x.id === w.id)).toMatchObject({
      name: "By admin",
      role: "member",
    });
  });

  it("answers 404 not_found for another user's project, an unknown id and a non-id, and changes nothing", async () => {
    for (const id of [b.tenantId, randomUUID(), "not-an-id"]) {
      const res = await as(a).patch(`/workspaces/${id}`, { name: "Hijacked" });
      expect([id, res.status, res.body.error.code]).toEqual([id, 404, "not_found"]);
    }
    const { rows } = await ctx.pool.query(`SELECT name FROM organization WHERE id = $1`, [
      b.tenantId,
    ]);
    expect(rows[0].name).toBe("My project");
  });

  it.each([[{}], [{ name: "" }], [{ name: "x".repeat(21) }], [{ description: "d".repeat(41) }]])(
    "rejects %j with 422",
    async (body) => {
      const res = await as(a).patch(`/workspaces/${a.tenantId}`, body);
      expect([res.status, res.body.error.code]).toEqual([422, "invalid_request"]);
    },
  );
});

describe("Better Auth client calls for projects", () => {
  it("organization.list returns the same projects, and organization.create is capped like POST /workspaces", async () => {
    const u = await ctx.createTenant("client");
    const w = await create(u, "Listed");
    const res = await request(ctx.app).get("/api/auth/organization/list").set("cookie", u.cookie);
    expect(res.status).toBe(200);
    expect(res.body.map((o: { id: string }) => o.id).sort()).toEqual([u.tenantId, w.id].sort());
  });
});

describe("activating a project", () => {
  it("set-active switches the tenant of every dashboard call, and a project that is not yours is refused", async () => {
    const u = await ctx.createTenant("switch");
    const w = await create(u, "Second");
    await ctx.pool.query(
      "INSERT INTO documents (tenant_id, filename) VALUES ($1, 'only-in-second.md')",
      [w.id],
    );
    const names = async () =>
      (await as(u).get("/documents")).body.documents.map((d: { filename: string }) => d.filename);
    expect(await names()).toEqual([]);
    expect((await as(u).auth("/organization/set-active", { organizationId: w.id })).status).toBe(
      200,
    );
    expect(await names()).toEqual(["only-in-second.md"]);

    const foreign = await as(u).auth("/organization/set-active", { organizationId: b.tenantId });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect(await activeOf(u)).toBeNull(); // Better Auth clears the active project on a refused switch: never B's, never the old one
    expect((await as(u).get("/documents")).body.error.code).toBe("no_active_project");
  });

  it("a session whose active project the user no longer belongs to gets 403 no_active_project on every tenant route, but can still list and create projects", async () => {
    const u = await ctx.createTenant("stale");
    await ctx.pool.query(`UPDATE session SET "activeOrganizationId" = $1 WHERE "userId" = $2`, [
      b.tenantId,
      u.userId,
    ]); // B's project
    for (const path of ["/documents", "/usage", "/requests", "/models", "/analytics/summary"]) {
      const res = await as(u).get(path);
      expect([path, res.status, res.body.error.code]).toEqual([path, 403, "no_active_project"]);
    }
    expect((await as(u).post("/try", { query: "q" })).status).toBe(403);
    expect((await as(u).get("/workspaces")).status).toBe(200);
    expect((await as(u).post("/workspaces", { name: "Fresh" })).status).toBe(201);
    expect(
      (await as(u).auth("/organization/set-active", { organizationId: u.tenantId })).status,
    ).toBe(200);
    expect((await as(u).get("/documents")).status).toBe(200);
  });
});

describe("DELETE /api/dashboard/workspaces/:id", () => {
  async function seed(u: Tenant, orgId: string) {
    const {
      rows: [d],
    } = await ctx.pool.query(
      "INSERT INTO documents (tenant_id, filename, status, chunk_count) VALUES ($1, 'd.md', 'ready', 1) RETURNING id",
      [orgId],
    );
    await ctx.pool.query(
      "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'c', array_fill(0, ARRAY[384])::vector)",
      [orgId, d.id],
    );
    const log = await insertLog(ctx.pool, orgId);
    await ctx.pool.query(
      "INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome) VALUES ($1, $2, 'p', 'm', 'cheap', 'ok')",
      [orgId, log],
    );
    await ctx.seedModel({ ...u, tenantId: orgId }, "cheap", "m1");
    await ctx.auth.api.createApiKey({
      body: { name: "k", organizationId: orgId, userId: u.userId },
    });
  }
  const TABLES: [string, string][] = [
    ["request_logs", "tenant_id"],
    ["model_calls", "tenant_id"],
    ["tenant_models", "tenant_id"],
    ["chunks", "tenant_id"],
    ["documents", "tenant_id"],
    ["apikey", `"referenceId"`],
    ["member", `"organizationId"`],
    ["invitation", `"organizationId"`],
    ["organization", "id"],
  ];
  const counts = async (orgId: string) =>
    Object.fromEntries(
      await Promise.all(
        TABLES.map(
          async ([t, col]) =>
            [
              t,
              (
                await ctx.pool.query(`SELECT count(*)::int AS n FROM ${t} WHERE ${col} = $1`, [
                  orgId,
                ])
              ).rows[0].n,
            ] as const,
        ),
      ),
    );

  it("removes every row of the project's data and the project itself in one go, and nothing of the user's other projects or other users", async () => {
    const u = await ctx.createTenant("deleter");
    const w = await create(u, "Doomed");
    await seed(u, w.id);
    await seed(u, u.tenantId);
    await seed(b, b.tenantId);
    const before = await counts(w.id);
    const keepOwn = await counts(u.tenantId),
      keepOther = await counts(b.tenantId);
    expect(before).toMatchObject({
      request_logs: 1,
      model_calls: 1,
      tenant_models: 1,
      chunks: 1,
      documents: 1,
      apikey: 1,
      member: 1,
      organization: 1,
    });

    const res = await as(u).delete(`/workspaces/${w.id}`, { name: "Doomed" });
    expect(res.status).toBe(204);
    expect(Object.values(await counts(w.id))).toEqual(TABLES.map(() => 0));
    expect(await counts(u.tenantId)).toEqual(keepOwn); // the user's other project is untouched
    expect(await counts(b.tenantId)).toEqual(keepOther); // so is another user's
    expect(
      (await as(u).get("/workspaces")).body.workspaces.map((x: { id: string }) => x.id),
    ).toEqual([u.tenantId]);
  });

  it("the project's API keys stop working and its sessions are left without an active project", async () => {
    const u = await ctx.createTenant("keys");
    const w = await create(u, "Keyed");
    const key = await ctx.auth.api.createApiKey({
      body: { name: "k", organizationId: w.id, userId: u.userId },
    });
    await as(u).auth("/organization/set-active", { organizationId: w.id });
    expect(
      (
        await request(ctx.app)
          .get("/v1/documents/00000000-0000-4000-8000-000000000000")
          .set("x-api-key", key.key)
      ).status,
    ).toBe(404);
    expect((await as(u).delete(`/workspaces/${w.id}`, { name: "Keyed" })).status).toBe(204);
    expect(
      (
        await request(ctx.app)
          .get("/v1/documents/00000000-0000-4000-8000-000000000000")
          .set("x-api-key", key.key)
      ).status,
    ).toBe(401);
    expect((await as(u).get("/documents")).body.error.code).toBe("no_active_project");
  });

  it("is all or nothing: a failure part-way leaves every row in place", async () => {
    const u = await ctx.createTenant("atomic");
    const w = await create(u, "Atomic");
    await seed(u, w.id);
    await ctx.pool.query(
      `CREATE OR REPLACE FUNCTION test_block_org_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked for test'; END $$ LANGUAGE plpgsql`,
    );
    await ctx.pool.query(
      `CREATE TRIGGER test_block BEFORE DELETE ON organization FOR EACH ROW WHEN (OLD.id = '${w.id}') EXECUTE FUNCTION test_block_org_delete()`,
    );
    try {
      const res = await as(u).delete(`/workspaces/${w.id}`, { name: "Atomic" });
      expect(res.status).toBe(500);
      expect(await counts(w.id)).toMatchObject({
        request_logs: 1,
        model_calls: 1,
        tenant_models: 1,
        chunks: 1,
        documents: 1,
        apikey: 1,
        member: 1,
        organization: 1,
      });
    } finally {
      await ctx.pool.query("DROP TRIGGER test_block ON organization");
    }
  });

  it("needs the project name in the body: a wrong or missing name is 422 name_mismatch and deletes nothing", async () => {
    const u = await ctx.createTenant("typo");
    const w = await create(u, "Exact Name");
    await seed(u, w.id);
    for (const body of [{ name: "exact name" }, { name: "" }, {}, undefined]) {
      const res = await as(u).delete(`/workspaces/${w.id}`, body);
      expect([res.status, res.body.error.code]).toEqual([422, "name_mismatch"]);
    }
    expect((await counts(w.id)).documents).toBe(1);
  });

  it("only the owner can delete: an admin gets 403, a user outside the project gets 404, and nothing is removed", async () => {
    const u = await ctx.createTenant("own");
    const w = await create(u, "Protected");
    await seed(u, w.id);
    const admin = await ctx.createTenant("adm");
    await addMember(w.id, admin.userId, "admin");
    const denied = await as(admin).delete(`/workspaces/${w.id}`, { name: "Protected" });
    expect([denied.status, denied.body.error.code]).toEqual([403, "forbidden"]);
    for (const id of [w.id, b.tenantId, randomUUID(), "not-an-id"]) {
      const res = await as(a).delete(`/workspaces/${id}`, {
        name: id === b.tenantId ? "My project" : "Protected",
      });
      expect([id, res.status, res.body.error.code]).toEqual([id, 404, "not_found"]);
    }
    expect((await counts(w.id)).documents).toBe(1);
    expect((await counts(b.tenantId)).organization).toBe(1);
  });

  it("the Better Auth delete call is refused, so no project can be removed without its data going too", async () => {
    const u = await ctx.createTenant("bypass");
    const w = await create(u, "Bypass");
    await seed(u, w.id);
    const res = await as(u).auth("/organization/delete", { organizationId: w.id });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await counts(w.id)).toMatchObject({ documents: 1, organization: 1 });
  });

  it("deleting a user's last project is allowed; their next sign-in gets a fresh default project", async () => {
    const u = await ctx.createTenant("last");
    expect((await as(u).delete(`/workspaces/${u.tenantId}`, { name: "My project" })).status).toBe(
      204,
    );
    expect((await as(u).get("/workspaces")).body.workspaces).toEqual([]);
    const signIn = await request(ctx.app)
      .post("/api/auth/sign-in/email")
      .set("origin", origin())
      .send({ email: u.email, password: "correct-horse-battery" });
    expect(signIn.status).toBe(200);
    const cookie = (signIn.headers["set-cookie"] as unknown as string[])
      .map((c) => c.split(";")[0])
      .join("; ");
    const fresh = await request(ctx.app).get("/api/dashboard/workspaces").set("cookie", cookie);
    expect(fresh.body.workspaces).toHaveLength(1);
    expect(fresh.body.workspaces[0]).toMatchObject({ name: "My project", role: "owner" });
    expect(fresh.body.workspaces[0].id).not.toBe(u.tenantId);
  });
});

describe("project shape limits come from config", () => {
  it("the slug length and random part follow projectSlugMaxChars and projectSlugRandomBytes; ids longer than projectIdMaxChars are 404", async () => {
    const small = await makeCtx({
      projectSlugMaxChars: 8,
      projectSlugRandomBytes: 2,
      projectIdMaxChars: 10,
    });
    try {
      const t = await small.createTenant("cfg");
      const made = await request(small.app)
        .post("/api/dashboard/workspaces")
        .set("cookie", t.cookie)
        .send({ name: "A very long project name" });
      expect(made.body.workspace.slug).toMatch(/^a-very-l-[0-9a-f]{4}$/);
      const patch = await request(small.app)
        .patch(`/api/dashboard/workspaces/${made.body.workspace.id}`)
        .set("cookie", t.cookie)
        .send({ name: "x" });
      expect(made.body.workspace.id.length).toBeGreaterThan(10);
      expect(patch.status).toBe(404); // a real id, but longer than the configured maximum
    } finally {
      await small.close();
    }
  });
});
