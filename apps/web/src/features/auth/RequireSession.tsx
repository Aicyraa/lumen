import { Navigate, Outlet } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { Unreachable } from "../../shared/ui/Unreachable";
import { readSession } from "./sessionShape";

// Guards the dashboard: no session means sign-in. While the session loads render nothing, so neither the
// dashboard nor a wrong redirect flashes. If the API cannot be reached, say so with a retry instead of redirecting.
export function RequireSession() {
  const s = readSession(authClient.useSession());
  if (s.pending) return null;
  if (s.user) return <Outlet />;
  if (s.error) return <Unreachable onRetry={s.refetch} />;
  return <Navigate to="/signin" replace />;
}
