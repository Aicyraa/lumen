import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authApi, newEmail, PASSWORD } from "../../helpers/auth.js";
import { type Ctx, makeCtx } from "../../helpers/ctx.js";

let ctx: Ctx;
afterEach(async () => {
  await ctx.close();
});

const { post, signUp, mailsTo } = authApi(() => ctx);
const resend = (email: string, headers: Record<string, string> = {}) =>
  post("/send-verification-email", { email }, headers);
const mailCount = (email: string) => mailsTo(email).length;

describe("one inbox cannot be flooded", () => {
  beforeEach(async () => {
    ctx = await makeCtx({
      verificationResendMax: 1000,
      verificationResendPerEmailMax: 2,
      verificationResendPerEmailWindowSeconds: 3600,
    });
  });

  it("sends at most verificationResendPerEmailMax emails to one address per window, whichever route asks, from any number of addresses", async () => {
    const email = newEmail();
    await signUp(email); // mail 1
    for (let i = 0; i < 6; i++)
      expect((await resend(email, { "x-forwarded-for": `198.51.100.${i}` })).status).toBe(200);
    expect(mailCount(email)).toBe(2);
    await post("/sign-in/email", { email, password: PASSWORD }); // an unverified sign-in also sends mail
    await signUp(email);
    expect(mailCount(email)).toBe(2);
  });

  it("answers exactly the same for an address that has no account, before and after the limit, so nothing can be enumerated", async () => {
    const known = newEmail(),
      unknown = newEmail();
    await signUp(known);
    const outcome = async (email: string) => {
      const r = await resend(email);
      return [r.status, r.body];
    };
    const knownResponses = [
      await outcome(known),
      await outcome(known),
      await outcome(known),
      await outcome(known),
    ];
    const unknownResponses = [
      await outcome(unknown),
      await outcome(unknown),
      await outcome(unknown),
      await outcome(unknown),
    ];
    expect(unknownResponses).toEqual(knownResponses);
    expect(mailCount(unknown)).toBe(0);
  });

  it("limits each address on its own", async () => {
    const [a, b] = [newEmail(), newEmail()];
    await signUp(a);
    await signUp(b);
    for (let i = 0; i < 4; i++) await resend(a);
    await resend(b);
    expect([mailCount(a), mailCount(b)]).toEqual([2, 2]);
  });
});

describe("TRUST_PROXY", () => {
  const twoClients = async () => {
    const [x, y] = [newEmail(), newEmail()];
    await signUp(x);
    await signUp(y);
    const first = await resend(x, { "x-forwarded-for": "203.0.113.1" });
    const other = await resend(y, { "x-forwarded-for": "203.0.113.2" });
    return [first.status, other.status];
  };

  it("is off by default: X-Forwarded-For is ignored, so every client shares the per-address counter", async () => {
    ctx = await makeCtx({ verificationResendMax: 1 });
    expect(await twoClients()).toEqual([200, 429]);
  });

  it("with one trusted proxy hop, the client address from X-Forwarded-For is what is counted", async () => {
    ctx = await makeCtx({ verificationResendMax: 1, trustProxy: 1 });
    expect(await twoClients()).toEqual([200, 200]);
  });
});
