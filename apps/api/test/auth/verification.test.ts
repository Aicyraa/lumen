import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx } from "../helpers/ctx.js";

let ctx: Ctx;
beforeAll(async () => { ctx = await makeCtx({ verificationResendMax: 2, verificationEmailExpiresSeconds: 3600 }); });
afterAll(async () => { await ctx.close(); });

const origin = () => ctx.config.dashboardOrigin;
const PASSWORD = "correct-horse-battery";
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  request(ctx.app).post(`/api/auth${path}`).set("origin", origin()).set(headers).send(body);
const signUp = (email: string, extra: object = {}) => post("/sign-up/email", { email, password: PASSWORD, name: "New", ...extra });
const signIn = (email: string) => post("/sign-in/email", { email, password: PASSWORD });
const newEmail = () => `v-${randomUUID()}@example.test`;
const mailsTo = (email: string) => ctx.mails.filter((m) => m.to === email);
// the link exactly as the user would click it (path and query only; supertest talks to the app directly)
const linkPath = (email: string) => {
  const text = mailsTo(email).at(-1)!.text;
  const url = new URL(text.match(/https?:\/\/\S+/)![0]);
  return url.pathname + url.search;
};
const userRow = async (email: string) => (await ctx.pool.query(`SELECT id, "emailVerified" AS verified FROM "user" WHERE email = $1`, [email])).rows[0];

describe("email verification", () => {
  it("sign-up creates the user unverified, starts no session and sends one verification email", async () => {
    const email = newEmail();
    const res = await signUp(email);
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.body.token).toBeNull();
    expect((await userRow(email)).verified).toBe(false);
    expect(mailsTo(email)).toHaveLength(1);
    expect(mailsTo(email)[0].subject).toMatch(/verify/i);
  });

  it("the link goes to the API verify endpoint and always redirects to the dashboard origin's /verify-email, whatever callbackURL the client asked for", async () => {
    const email = newEmail();
    await signUp(email, { callbackURL: `${origin()}/somewhere-else` });
    const url = new URL(mailsTo(email)[0].text.match(/https?:\/\/\S+/)![0]);
    expect(url.origin + url.pathname).toBe(`${ctx.config.authUrl}/api/auth/verify-email`);
    expect(url.searchParams.get("token")).toBeTruthy();
    expect(url.searchParams.get("callbackURL")).toBe(`${origin()}/verify-email?status=verified`);
  });

  it("an unverified user cannot sign in: 403 EMAIL_NOT_VERIFIED, no session, and a fresh email is sent", async () => {
    const email = newEmail();
    await signUp(email);
    const before = mailsTo(email).length;
    const res = await signIn(email);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(mailsTo(email).length).toBe(before + 1);
  });

  it("clicking the link verifies the user, redirects to /verify-email?status=verified and signs them in once; then password sign-in works", async () => {
    const email = newEmail();
    await signUp(email);
    const click = await request(ctx.app).get(linkPath(email));
    expect(click.status).toBe(302);
    expect(click.headers.location).toBe(`${origin()}/verify-email?status=verified`);
    const cookie = (click.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
    expect((await userRow(email)).verified).toBe(true);
    const session = await request(ctx.app).get("/api/auth/get-session").set("cookie", cookie);
    expect(session.body.user.email).toBe(email);
    expect(session.body.session.activeOrganizationId).toBeTruthy();
    expect((await signIn(email)).status).toBe(200);
  });

  it("the link works once: a second click changes nothing, creates no new session and does not report an error", async () => {
    const email = newEmail();
    await signUp(email);
    const path = linkPath(email);
    await request(ctx.app).get(path);
    const sessions = async () => (await ctx.pool.query(`SELECT count(*)::int AS n FROM session WHERE "userId" = $1`, [(await userRow(email)).id])).rows[0].n;
    const before = await sessions();
    const again = await request(ctx.app).get(path);
    expect(again.status).toBe(302);
    expect(again.headers.location).toBe(`${origin()}/verify-email?status=verified`);
    expect(again.headers["set-cookie"]).toBeUndefined();
    expect(await sessions()).toBe(before);
  });

  it("a tampered token redirects to /verify-email with error=invalid_token and verifies nobody", async () => {
    const email = newEmail();
    await signUp(email);
    const bad = linkPath(email).replace(/token=([^&]+)/, (_m, t: string) => `token=${t.slice(0, -4)}AAAA`);
    const res = await request(ctx.app).get(bad);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(loc.origin + loc.pathname).toBe(`${origin()}/verify-email`);
    expect(loc.searchParams.get("error")).toBe("invalid_token");
    expect((await userRow(email)).verified).toBe(false);
  });

  it("an expired link redirects with error=token_expired", async () => {
    const short = await makeCtx({ verificationEmailExpiresSeconds: 1 });
    try {
      const email = newEmail();
      await request(short.app).post("/api/auth/sign-up/email").set("origin", short.config.dashboardOrigin).send({ email, password: PASSWORD, name: "X" });
      const url = new URL(short.mails.find((m) => m.to === email)!.text.match(/https?:\/\/\S+/)![0]);
      await new Promise((r) => setTimeout(r, 2200));
      const res = await request(short.app).get(url.pathname + url.search);
      expect(new URL(res.headers.location).searchParams.get("error")).toBe("token_expired");
    } finally { await short.close(); }
  });

  it("resend sends a new email, is generic for unknown addresses (no mail, no enumeration) and is rate limited per client address", async () => {
    const email = newEmail();
    await signUp(email);
    const ip = { "x-forwarded-for": "198.51.100.7" }; // a client-sent header must not matter, see below
    const first = await post("/send-verification-email", { email, callbackURL: `${origin()}/verify-email` }, ip);
    expect(first.status).toBe(200);
    expect(mailsTo(email)).toHaveLength(2);
    const unknown = await post("/send-verification-email", { email: newEmail() });
    expect(unknown.status).toBe(200);
    // the limit is 2 per window (config): the third call from the same client is refused, even with a different spoofed header
    const third = await post("/send-verification-email", { email }, { "x-forwarded-for": "203.0.113.99" });
    expect(third.status).toBe(429);
    expect(mailsTo(email)).toHaveLength(2);
  });
});
