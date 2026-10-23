import { Navigate, Outlet } from "react-router";
import { authClient } from "../lib/auth-client";

// Guards the dashboard: no session means sign-in. While the session loads render nothing, so neither the
// dashboard nor a wrong redirect flashes.
export function RequireSession() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return null;
  if (!data) return <Navigate to="/signin" replace />;
  return <Outlet />;
}
