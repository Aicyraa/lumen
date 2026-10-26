import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Ctx } from "./ctx.js";

export const PASSWORD = "correct-horse-battery";
export const newEmail = () => `u-${randomUUID()}@example.test`;

// HTTP helpers for the Better Auth routes. The context is created in a hook, so it is passed as a getter.
export function authApi(ctx: () => Ctx) {
  const post = (path: string, body: object, headers: Record<string, string> = {}) =>
    request(ctx().app)
      .post(`/api/auth${path}`)
      .set("origin", ctx().config.dashboardOrigin)
      .set(headers)
      .send(body);
  return {
    post,
    signUp: (email: string, extra: object = {}) =>
      post("/sign-up/email", { email, password: PASSWORD, name: "New", ...extra }),
    mailsTo: (email: string) => ctx().mails.filter((m) => m.to === email),
  };
}
