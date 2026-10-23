import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx } from "./helpers/ctx.js";

let ctx;
beforeAll(async () => { ctx = await makeCtx(); });
afterAll(async () => { await ctx.close(); });

describe("first sign-in creates a personal organization", () => {
  it("email sign-up gives the user one organization and makes it the active one on the session", async () => {
    const email = `owner-${Date.now()}@example.test`;
    const signUp = await request(ctx.app).post("/api/auth/sign-up/email").set("origin", ctx.config.dashboardOrigin)
      .send({ email, password: "correct-horse-battery", name: "Owner" });
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers["set-cookie"].map((c) => c.split(";")[0]).join("; ");

    const orgs = await ctx.pool.query(`SELECT "organizationId" FROM member WHERE "userId" = $1`, [signUp.body.user.id]);
    expect(orgs.rows).toHaveLength(1);

    const session = await request(ctx.app).get("/api/auth/get-session").set("cookie", cookie);
    expect(session.body.session.activeOrganizationId).toBe(orgs.rows[0].organizationId);
  });

  it("a user who has no organization yet gets one when a session is created", async () => {
    // simulates a user created before the hook existed (or whose first attempt failed)
    const { rows } = await ctx.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Legacy', $2, true, now(), now()) RETURNING id`, [`legacy-${Date.now()}`, `legacy-${Date.now()}@example.test`]);
    const ctxSession = await ctx.auth.$context;
    const session = await ctxSession.internalAdapter.createSession(rows[0].id);
    expect(session.activeOrganizationId).toBeTruthy();
  });
});
