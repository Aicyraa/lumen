import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";

export function createAuth({ pool, config }) {
  // A provider without credentials is skipped, so dev works with email + password only.
  const socialProviders = {};
  if (config.google.clientId && config.google.clientSecret) socialProviders.google = config.google;
  if (config.github.clientId && config.github.clientSecret) socialProviders.github = config.github;

  // A signed-in user must always have a tenant: create the personal organization once, reuse it afterwards.
  async function ensurePersonalOrg(userId, name) {
    const found = await pool.query(`SELECT "organizationId" FROM member WHERE "userId" = $1 ORDER BY "createdAt" LIMIT 1`, [userId]);
    if (found.rows[0]) return found.rows[0].organizationId;
    const org = await auth.api.createOrganization({
      body: { name: `${name || "My"} workspace`, slug: `personal-${userId.toLowerCase()}`, userId },
    });
    return org.id;
  }

  const auth = betterAuth({
    database: pool,
    baseURL: config.authUrl,
    secret: config.authSecret,
    trustedOrigins: [config.dashboardOrigin],
    socialProviders,
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
    emailAndPassword: { enabled: true },
    plugins: [
      organization(),
      // Keys belong to an organization (the tenant). The plugin's own per-key limit (default 10/day) is
      // off: the per-tenant limiter in middleware/rateLimit.js is the only one.
      apiKey({ references: "organization", rateLimit: { enabled: false } }),
    ],
  });
  return auth;
}
