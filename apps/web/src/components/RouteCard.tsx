import { fmtScore, routeWhy, tierLabel } from "../lib/format";

export function RouteCard({ route, big = false }: { route: { tier: string | null; k: number | null; escalated: boolean | null; difficulty: number | null; top_score: number | null }; big?: boolean }) {
  return (
    <div className="card card-route">
      <div className="label">ROUTE</div>
      <div className={`route-tier ${big ? "big" : ""} ${route.tier === "expensive" ? "lime" : route.tier === "none" ? "muted-2" : ""}`}>{tierLabel(route.tier)}</div>
      <div className="small muted-2">{routeWhy(route)}</div>
      <dl className="kv">
        <div><dt>K</dt><dd>{route.k ?? "—"}</dd></div>
        <div><dt>DIFFICULTY</dt><dd>{fmtScore(route.difficulty)}</dd></div>
        <div><dt>ESCALATED</dt><dd>{route.escalated == null ? "—" : String(route.escalated)}</dd></div>
        <div><dt>TOP SCORE</dt><dd>{fmtScore(route.top_score)}</dd></div>
      </dl>
    </div>
  );
}
