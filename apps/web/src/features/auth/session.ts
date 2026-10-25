import { authClient } from "../../shared/lib/auth-client";
import { readSession } from "./sessionShape";

// The active organization is the tenant. Every query key includes it, so one tenant's cache entry can never be read as another's.
export const useOrgId = () => readSession(authClient.useSession()).orgId;
