export const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");
export const fmtMs = (n: number | null | undefined) =>
  n == null ? "—" : `${fmtInt(Math.round(n))} ms`;
export const fmtScore = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));

// Estimated provider cost (the tenant's own, from the prices they entered). null means no price was set.
export const fmtCost = (n: number | null | undefined) =>
  n == null
    ? "no price set"
    : n === 0
      ? "$0"
      : n < 0.0001
        ? "<$0.0001"
        : `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (isoDate: string) =>
  new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// A usage meter turns amber above 80% of its limit (docs/WEBSITE.md).
export const isNearLimit = (used: number, max: number) => max > 0 && used / max > 0.8;

export const RATE_LIMITED = "provider_rate_limited";

export const tierLabel = (t: string | null | undefined, status?: string) =>
  status === RATE_LIMITED && !t
    ? "Rate limited"
    : t === "none"
      ? "No model called"
      : t === "expensive"
        ? "Expensive tier"
        : t === "cheap"
          ? "Cheap tier"
          : "Failed";
export const tierTone = (t: string | null | undefined) =>
  (t === "expensive" ? "expensive" : t === "none" ? "none" : t === "cheap" ? "cheap" : "failed") as
    | "expensive"
    | "none"
    | "cheap"
    | "failed";

// Plain statement of what the route fields say. Nothing here is guessed beyond the returned fields.
export function routeWhy(r: {
  status?: string;
  tier: string | null;
  k: number | null;
  escalated: boolean | null;
  difficulty: number | null;
  top_score: number | null;
}) {
  if (r.tier === "none")
    return "Nothing in your documents matched well enough, so no model was called.";
  if (r.tier === "expensive" && r.escalated)
    return `The router sent this to the larger model out of caution (difficulty ${fmtScore(r.difficulty)}, best match ${fmtScore(r.top_score)}) and used ${r.k} passages.`;
  if (r.tier === "expensive")
    return `The question was clearly hard (difficulty ${fmtScore(r.difficulty)}), so the router used the larger model with ${r.k} passages.`;
  if (r.tier === "cheap")
    return `A strong match (best ${fmtScore(r.top_score)}) and a plain question, so the smaller model with ${r.k} passages was used.`;
  if (r.status === RATE_LIMITED)
    return "The model provider is rate limiting this workspace, so no answer was returned.";
  return "The model provider failed, so no answer was returned.";
}
