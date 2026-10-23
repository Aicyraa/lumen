import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useOrgId } from "../lib/session";
import { fmtInt, isNearLimit } from "../lib/format";
import type { Usage } from "../lib/types";

const ROWS = [
  ["Documents", "documents"],
  ["Requests / min", "requests_per_minute"],
  ["This month", "requests_this_month"],
] as const;

// Sidebar USAGE panel. Every number, including the limits, comes from GET /api/dashboard/usage.
export function UsageMeters() {
  const org = useOrgId();
  const { data } = useQuery({ queryKey: ["usage", org], enabled: !!org, queryFn: () => api<Usage>("/api/dashboard/usage"), refetchInterval: 15000 });
  return (
    <div className="usage">
      <div className="label-sm">USAGE</div>
      {data &&
        ROWS.map(([label, key]) => {
          const { used, max } = data[key];
          const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
          return (
            <div key={key} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}
              data-level={isNearLimit(used, max) ? "warn" : "ok"} className="meter">
              <div className="meter-head"><span>{label}</span><span className="mono">{fmtInt(used)} / {fmtInt(max)}</span></div>
              <div className="meter-track"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
    </div>
  );
}
