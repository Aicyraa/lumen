import { useQuery } from "@tanstack/react-query";
import { isProjectMismatch } from "../../shared/lib/activeProject";
import { api } from "../../shared/lib/api";
import { fmtInt, isNearLimit } from "../../shared/lib/format";
import type { Usage } from "../../shared/lib/types";
import { useOrgId } from "../auth/session";

const ROWS = [
  ["Documents", "documents"],
  ["Requests / min", "requests_per_minute"],
  ["This month", "requests_this_month"],
] as const;

// Sidebar USAGE panel. Every number, including the limits, comes from GET /api/dashboard/usage.
export function UsageMeters() {
  const org = useOrgId();
  const { data } = useQuery({
    queryKey: ["usage", org],
    enabled: !!org,
    queryFn: () => api<Usage>("/api/dashboard/usage"),
    // a stale tab (409 project_mismatch) stops asking until it is reloaded
    refetchInterval: (q) => (isProjectMismatch(q.state.error) ? false : 15000),
  });
  return (
    <div className="usage">
      <div className="label-sm">USAGE</div>
      {data &&
        ROWS.map(([label, key]) => {
          const { used, max } = data[key];
          const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
          return (
            <div
              key={key}
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={used}
              data-level={isNearLimit(used, max) ? "warn" : "ok"}
              className="meter"
            >
              <div className="meter-head">
                <span>{label}</span>
                <span className="mono">
                  {fmtInt(used)} / {fmtInt(max)}
                </span>
              </div>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
    </div>
  );
}
