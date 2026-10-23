import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { authClient } from "../lib/auth-client";
import { readSession } from "../lib/sessionShape";

// Drops the whole query cache whenever the signed-in user or active organization changes, or the session disappears.
export function SessionCacheGuard() {
  const qc = useQueryClient();
  const { pending: isPending, user, userId, orgId } = readSession(authClient.useSession());
  const identity = `${user ? userId || "user" : ""}|${orgId}`;
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (isPending) return; // loading is not a change
    if (previous.current !== null && previous.current !== identity) qc.clear();
    previous.current = identity;
  }, [identity, isPending, qc]);
  return null;
}
