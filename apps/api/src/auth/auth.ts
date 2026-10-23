import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import type { Config } from "../config/config.js";
import type { Pool } from "../db/pool.js";
import type { Logger } from "pino";
import type { Mailer } from "../services/mailer.js";

export type Auth = ReturnType<typeof createAuth>;

// mailer and log are only needed to send mail; the migration script builds the same auth without them.
export function createAuth({ pool, config, mailer, log, social }: { pool: Pool; config: Config; mailer?: Mailer; log?: Logger; social?: Record<string, object> }) {
  // A provider without credentials is skipped, so dev works with email + password only.
  const socialProviders: Partial<Record<"google" | "github", { clientId: string; clientSecret: string }>> = {};
  const { google, github } = config;
  if (google.clientId && google.clientSecret) socialProviders.google = { clientId: google.clientId, clientSecret: google.clientSecret };
  if (github.clientId && github.clientSecret) socialProviders.github = { clientId: github.clientId, clientSecret: github.clientSecret };

  // A signed-in user must always have a tenant: create the personal organization once, reuse it afterwards.
  let createOrganization: (body: { name: string; slug: string; userId: string }) => Promise<{ id: string }>;
  async function ensurePersonalOrg(userId: string, name?: string | null): Promise<string> {
    const found = await pool.query(`SELECT "organizationId" FROM member WHERE "userId" = $1 ORDER BY "createdAt" LIMIT 1`, [userId]);
    if (found.rows[0]) return found.rows[0].organizationId;
    const org = await createOrganization({ name: `${name || "My"} workspace`, slug: `personal-${userId.toLowerCase()}`, userId });
    return org.id;
  }

  const auth = betterAuth({
    database: pool,
    baseURL: config.authUrl,
    secret: config.authSecret,
    trustedOrigins: [config.dashboardOrigin],
    socialProviders: { ...socialProviders, ...social }, // `social` only exists so tests can plug in a fake provider
    account: {
      // Same-email sign-in with a second provider is refused (account_not_linked); a signed-in user links explicitly with linkSocial.
      // allowDifferentEmails: that explicit step is authenticated, and GitHub/Google emails often differ from the sign-up email.
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true },
    },
    databaseHooks: {
      user: { create: { after: async (user) => { await ensurePersonalOrg(user.id, user.name); } } },
      // Also covers users created before the hook existed: no session ever starts without an active tenant.
      session: {
        create: {
          before: async (session) => {
            const { rows } = await pool.query(`SELECT name FROM "user" WHERE id = $1`, [session.userId]);
            const activeOrganizationId = await ensurePersonalOrg(session.userId, rows[0]?.name);
            return { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },
    emailAndPassword: { enabled: true, requireEmailVerification: true }, // sign-in is refused until the email is verified
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true, // an unverified user who tries to sign in gets a fresh link
      autoSignInAfterVerification: true, // the first click also signs in; a second click only redirects
      expiresIn: config.verificationEmailExpiresSeconds,
      sendVerificationEmail: async ({ user, url }) => {
        // Whatever callbackURL the client sent, the user lands on the dashboard's /verify-email page (errors add ?error=...).
        const link = new URL(url);
        link.searchParams.set("callbackURL", `${config.dashboardOrigin}/verify-email?status=verified`);
        // Not awaited: the response time must not reveal whether the address exists.
        void mailer?.({
          to: user.email,
          subject: "Verify your email for Lumen",
          text: `Open this link to verify your email and finish creating your Lumen account:\n\n${link.toString()}\n\nIf you did not sign up, ignore this email.`,
        }).catch((err: Error) => log?.error({ err: err.message }, "verification email failed"));
      },
    },
    plugins: [
      organization(),
      // Keys belong to an organization (the tenant). The plugin's own per-key limit (default 10/day) is
      // off: the per-tenant limiter in middleware/rateLimit.js is the only one.
      apiKey({ references: "organization", rateLimit: { enabled: false } }),
    ],
  });
  createOrganization = (body) => auth.api.createOrganization({ body }) as Promise<{ id: string }>;
  return auth;
}
