import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { authClient } from "../lib/auth-client";

// Drops the whole query cache whenever the signed-in user or active organization changes, or the session disappears.
export function SessionCacheGuard() {
  const qc = useQueryClient();
  const { data, isPending } = authClient.useSession();
  const identity = `${data?.user.id ?? ""}|${data?.session.activeOrganizationId ?? ""}`;
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (isPending) return; // loading is not a change
    if (previous.current !== null && previous.current !== identity) qc.clear();
    previous.current = identity;
  }, [identity, isPending, qc]);
  return null;
}
