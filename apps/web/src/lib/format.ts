export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const fmtMs = (n: number | null | undefined) => (n == null ? "—" : `${fmtInt(Math.round(n))} ms`);
export const fmtScore = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));

// Estimated provider cost (the tenant's own, from the prices they entered). null means no price was set.
export const fmtCost = (n: number | null | undefined) => (n == null ? "no price set" : n === 0 ? "$0" : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`);

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (isoDate: string) => new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// A usage meter turns amber above 80% of its limit (DESIGN.md).
export const isNearLimit = (used: number, max: number) => max > 0 && used / max > 0.8;
