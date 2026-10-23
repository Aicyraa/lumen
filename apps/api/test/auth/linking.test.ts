import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";

// A fake Google: the "id token" is a JSON profile, accepted as is. Everything else (linking rules, sessions) is the real Better Auth.
const fakeGoogle = {
  clientId: "test-client", clientSecret: "test-secret",
  verifyIdToken: async () => true,
  getUserInfo: async (t: { idToken?: string }) => ({ user: JSON.parse(t.idToken!), data: {} }),
};
let ctx: Ctx;
beforeAll(async () => { ctx = await makeCtx({}, { social: { google: fakeGoogle } }); });
afterAll(async () => { await ctx.close(); });

const origin = () => ctx.config.dashboardOrigin;
const profile = (email: string) => ({ id: `g-${randomUUID()}`, email, name: "G User", emailVerified: true });
const idToken = (p: object) => ({ token: JSON.stringify(p) });
const googleSignIn = (p: object) => request(ctx.app).post("/api/auth/sign-in/social").set("origin", origin()).send({ provider: "google", idToken: idToken(p) });
const googleLink = (t: Tenant, p: object) => request(ctx.app).post("/api/auth/link-social").set("origin", origin()).set("cookie", t.cookie).send({ provider: "google", idToken: idToken(p) });
const accounts = async (userId: string) => (await ctx.pool.query(`SELECT "providerId" FROM account WHERE "userId" = $1 ORDER BY "providerId"`, [userId])).rows.map((r: { providerId: string }) => r.providerId);

describe("no implicit account linking", () => {
  it("a brand-new email can sign up with the provider: user, session and a default project, no verification email needed", async () => {
    const p = profile(`new-${randomUUID()}@example.test`);
    const res = await googleSignIn(p);
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    const { rows } = await ctx.pool.query(`SELECT u.id, (SELECT count(*)::int FROM member m WHERE m."userId" = u.id) AS projects FROM "user" u WHERE u.email = $1`, [p.email]);
    expect(rows[0].projects).toBe(1);
    expect(ctx.mails.filter((m) => m.to === p.email)).toHaveLength(0);
  });

  it("signing in with the provider when a user with that email already exists is rejected with account_not_linked, and links nothing", async () => {
    const owner = await ctx.createTenant("owner");
    const res = await googleSignIn(profile(owner.email));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body).toLowerCase()).toContain("account_not_linked");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await accounts(owner.userId)).toEqual(["credential"]);
  });

  it("the same applies when the provider has not verified the email", async () => {
    const owner = await ctx.createTenant("owner2");
    const res = await googleSignIn({ ...profile(owner.email), emailVerified: false });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await accounts(owner.userId)).toEqual(["credential"]);
  });
});

describe("explicit linking from a signed-in session", () => {
  it("linkSocial adds the provider to the signed-in user; afterwards both the provider and the password sign in as the same user", async () => {
    const owner = await ctx.createTenant("linker");
    const p = profile(owner.email);
    expect((await googleSignIn(p)).status).toBeGreaterThanOrEqual(400); // before linking

    const link = await googleLink(owner, p);
    expect(link.status).toBe(200);
    expect(await accounts(owner.userId)).toEqual(["credential", "google"]);

    const viaGoogle = await googleSignIn(p);
    expect(viaGoogle.status).toBe(200);
    expect(viaGoogle.body.user.id).toBe(owner.userId);
    const viaPassword = await request(ctx.app).post("/api/auth/sign-in/email").set("origin", origin()).send({ email: owner.email, password: "correct-horse-battery" });
    expect(viaPassword.status).toBe(200);
    expect(viaPassword.body.user.id).toBe(owner.userId);
  });

  it("a provider account with a different email can be linked explicitly (GitHub emails are often different)", async () => {
    const owner = await ctx.createTenant("diff");
    const other = profile(`other-${randomUUID()}@example.test`);
    expect((await googleLink(owner, other)).status).toBe(200);
    const res = await googleSignIn(other);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(owner.userId);
  });

  it("linking needs a session, and a provider account already linked to another user cannot be taken over", async () => {
    const p = profile(`free-${randomUUID()}@example.test`);
    const anon = await request(ctx.app).post("/api/auth/link-social").set("origin", origin()).send({ provider: "google", idToken: idToken(p) });
    expect(anon.status).toBe(401);
    const a = await ctx.createTenant("a");
    const b = await ctx.createTenant("b");
    expect((await googleLink(a, p)).status).toBe(200);
    const steal = await googleLink(b, p);
    expect(steal.status).toBeGreaterThanOrEqual(400);
    expect(await accounts(b.userId)).toEqual(["credential"]);
  });
});
