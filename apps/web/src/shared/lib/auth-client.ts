import { apiKeyClient } from "@better-auth/api-key/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { apiBase } from "./config";
import { guardedFetch } from "./guardedFetch";

export const authClient = createAuthClient({
  baseURL: apiBase || window.location.origin, // apiBase is empty when VITE_API_URL=/ (same origin)
  fetchOptions: { customFetchImpl: guardedFetch },
  plugins: [organizationClient(), apiKeyClient()],
});
