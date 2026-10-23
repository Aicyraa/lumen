import { authClient } from "./auth-client";

// The active organization is the tenant. Every query key includes it, so one tenant's cache entry can never be read as another's.
export const useOrgId = () => authClient.useSession().data?.session.activeOrganizationId ?? "";
