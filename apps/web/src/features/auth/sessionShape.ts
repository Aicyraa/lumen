// useSession can return null, {}, a body without user or session, or an error when the API is down.
// This is the only place that reads its shape; anything without a user counts as "no session".
interface Raw {
  data?: {
    user?: { id?: string; email?: string; name?: string | null } | null;
    session?: { activeOrganizationId?: string | null } | null;
  } | null;
  isPending?: boolean;
  error?: unknown;
  refetch?: (opts?: unknown) => unknown;
}

export function readSession(result: unknown) {
  const r = (result ?? {}) as Raw;
  const user = r.data?.user && typeof r.data.user === "object" ? r.data.user : null;
  return {
    pending: !!r.isPending,
    user,
    userId: user?.id ?? "",
    orgId: user ? (r.data?.session?.activeOrganizationId ?? "") : "",
    error: r.error ?? null,
    refetch: r.refetch,
  };
}
