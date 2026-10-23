import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";

export function createAuth({ pool, config }) {
  // A provider without credentials is skipped, so dev works with email + password only.
  const socialProviders = {};
  if (config.google.clientId && config.google.clientSecret) socialProviders.google = config.google;
  if (config.github.clientId && config.github.clientSecret) socialProviders.github = config.github;

  return betterAuth({
    database: pool,
    baseURL: config.authUrl,
    secret: config.authSecret,
    trustedOrigins: [config.dashboardOrigin],
    socialProviders,
    emailAndPassword: { enabled: true },
    plugins: [
      organization(),
      // Keys belong to an organization (the tenant). The plugin's own per-key limit (default 10/day) is
      // off: the per-tenant limiter in middleware/rateLimit.js is the only one.
      apiKey({ references: "organization", rateLimit: { enabled: false } }),
    ],
  });
}
