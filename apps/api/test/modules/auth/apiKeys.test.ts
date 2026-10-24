import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Ctx, makeCtx, type Tenant } from "../../helpers/ctx.js";

// These are the HTTP calls behind authClient.apiKey.create / list / delete (the web app uses the Better Auth client, no custom routes).
let ctx: Ctx, a: Tenant, b: Tenant;
beforeAll(async () => {
  ctx = await makeCtx();
  a = await ctx.createTenant("a");
  b = await ctx.createTenant("b");
});
afterAll(async () => {
  await ctx.close();
});

const origin = () => ctx.config.dashboardOrigin;
const create = (t: Tenant, body: object) =>
  request(ctx.app)
    .post("/api/auth/api-key/create")
    .set("cookie", t.cookie)
    .set("origin", origin())
    .send(body);
const list = (t: Tenant, orgId: string) =>
  request(ctx.app)
    .get(`/api/auth/api-key/list?organizationId=${orgId}`)
    .set("cookie", t.cookie)
    .set("origin", origin());
const del = (t: Tenant, keyId: string) =>
  request(ctx.app)
    .post("/api/auth/api-key/delete")
    .set("cookie", t.cookie)
    .set("origin", origin())
    .send({ keyId });
const v1 = (key: string) =>
  request(ctx.app).get("/v1/documents/00000000-0000-4000-8000-000000000000").set("x-api-key", key);

describe("API keys through the Better Auth endpoints, owned by the active organization", () => {
  it("creates a key for the session's organization, shows it once, lists it without the secret, and the key authenticates /v1 as that tenant", async () => {
    const made = await create(a, { name: "website bot", organizationId: a.tenantId });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({
      id: expect.any(String),
      name: "website bot",
      key: expect.any(String),
      start: expect.any(String),
      referenceId: a.tenantId,
    });
    expect((await v1(made.body.key)).status).toBe(404); // authenticated (not 401); the document id does not exist

    const listed = await list(a, a.tenantId);
    expect(listed.status).toBe(200);
    const mine = listed.body.apiKeys.find((k: { id: string }) => k.id === made.body.id);
    expect(mine).toMatchObject({
      name: "website bot",
      start: made.body.start,
      referenceId: a.tenantId,
    });
    expect(JSON.stringify(listed.body)).not.toContain(made.body.key);
    expect(
      listed.body.apiKeys.every((k: { referenceId: string }) => k.referenceId === a.tenantId),
    ).toBe(true);
  });

  it("revokes a key: it stops working on /v1 and leaves the list", async () => {
    const made = await create(a, { name: "temp", organizationId: a.tenantId });
    expect((await del(a, made.body.id)).status).toBe(200);
    expect((await v1(made.body.key)).status).toBe(401);
    expect((await list(a, a.tenantId)).body.apiKeys.map((k: { id: string }) => k.id)).not.toContain(
      made.body.id,
    );
  });

  it("refuses another tenant's organization for create, list and revoke, and leaves the key working", async () => {
    const theirs = await create(a, { name: "A's key", organizationId: a.tenantId });
    expect((await create(b, { name: "sneaky", organizationId: a.tenantId })).status).toBe(403);
    expect((await list(b, a.tenantId)).status).toBe(403);
    expect((await del(b, theirs.body.id)).status).toBe(403);
    expect((await v1(theirs.body.key)).status).toBe(404); // still valid
    expect((await create(a, { name: "no org" })).status).toBe(400); // organizationId is required
  });
});
