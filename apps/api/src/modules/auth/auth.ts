import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import type { Config } from "../../shared/config/config.js";
import type { Pool } from "../../shared/db/pool.js";
import type { Logger } from "pino";
import { createWindowCounter } from "./windowCounter.js";
import { KeyedLock } from "./keyedLock.js";
import { ownedProjectCount } from "../../shared/services/projects.js";
import type { Mailer } from "./mailer.js";

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
  async function ensurePersonalOrg(userId: string): Promise<string> {
    const found = await pool.query(`SELECT "organizationId" FROM member WHERE "userId" = $1 ORDER BY "createdAt" LIMIT 1`, [userId]);
    if (found.rows[0]) return found.rows[0].organizationId;
    const org = await createOrganization({ name: "My project", slug: `personal-${userId.toLowerCase()}`, userId });
    return org.id;
  }

  // One project creation per user at a time, from the cap check to the insert, for every way of creating one. No DB connection is held while waiting.
  // At most N verification emails per address per window, whichever route asks (sign-up, sign-in, resend) and from however many clients.
  // The mail is dropped silently, so responses are the same for every address and nothing can be enumerated.
  const perEmail = createWindowCounter({ windowMs: config.verificationResendPerEmailWindowSeconds * 1000, max: config.verificationResendPerEmailMax });
  const createLock = new KeyedLock();
  const held = new Map<string, () => void>();
  const releaseProjectLock = (userId: string) => { held.get(userId)?.(); held.delete(userId); };

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
      user: { create: { after: async (user) => { await ensurePersonalOrg(user.id); } } },
      // Also covers users created before the hook existed: no session ever starts without an active tenant.
      session: {
        create: {
          before: async (session) => {
            const activeOrganizationId = await ensurePersonalOrg(session.userId);
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
        if (!perEmail.allow(user.email.toLowerCase())) return;
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
      organization({
        organizationHooks: {
          // The cap holds for every way of creating a project, including the client's organization.create call.
          beforeCreateOrganization: async ({ user }) => {
            if (!user?.id) return;
            held.set(user.id, await createLock.acquire(user.id, config.projectCreateLockMs));
            if (await ownedProjectCount(pool, user.id).catch((err) => { releaseProjectLock(user.id); throw err; }) >= config.maxProjectsPerUser) {
              releaseProjectLock(user.id);
              throw new APIError("UNPROCESSABLE_ENTITY", { message: "Project limit reached.", code: "PROJECT_LIMIT" });
            }
          },
          afterCreateOrganization: async ({ user }) => { if (user?.id) releaseProjectLock(user.id); },
          // Deleting only the organization row would orphan the tenant's documents, logs and keys; DELETE /api/dashboard/workspaces/:id does it all in one transaction.
          beforeDeleteOrganization: async () => {
            throw new APIError("FORBIDDEN", { message: "Delete a project with DELETE /api/dashboard/workspaces/:id.", code: "USE_WORKSPACE_DELETE" });
          },
        },
      }),
      // Keys belong to an organization (the tenant). The plugin's own per-key limit (default 10/day) is
      // off: the per-tenant limiter in middleware/rateLimit.js is the only one.
      apiKey({ references: "organization", rateLimit: { enabled: false } }),
    ],
  });
  createOrganization = (body) => auth.api.createOrganization({ body }) as Promise<{ id: string }>;
  return Object.assign(auth, { releaseProjectLock });
}
