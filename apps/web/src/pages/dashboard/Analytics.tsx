import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHead, Segmented, ErrorText } from "../../components/ui";
import { CountUp } from "../../components/motion";
import { api } from "../../lib/api";
import { useOrgId } from "../../lib/session";
import { fmtCost, fmtDay, fmtInt, fmtMs, fmtScore } from "../../lib/format";
import type { Range, Summary, Unanswered } from "../../lib/types";

const RANGES = [["7d", "7D"], ["30d", "30D"]] as const;

const MIX = [
  ["cheap", "Cheap", "mix-cheap"], ["escalated", "Escalated (caution)", "mix-escalated"], ["expensive_hard", "Expensive (hard)", "mix-expensive"],
  ["none", "No answer — no model called", "mix-none"], ["failed", "Failed — provider error", "mix-failed"],
] as const;

export function Analytics() {
  const [range, setRange] = useState<Range>("7d");
  const org = useOrgId();
  const summary = useQuery({ queryKey: ["summary", org, range], enabled: !!org, queryFn: () => api<Summary>(`/api/dashboard/analytics/summary?range=${range}`) });
  const unanswered = useQuery({ queryKey: ["unanswered", org, range], enabled: !!org, queryFn: () => api<Unanswered>(`/api/dashboard/analytics/unanswered?range=${range}`) });
  const s = summary.data;
  const days = s?.per_day ?? [];
  const dayTotal = (d: Summary["per_day"][number]) => d.cheap + d.expensive + d.none + d.failed;
  const max = Math.max(1, ...days.map(dayTotal));
  const mixTotal = s ? MIX.reduce((a, [k]) => a + s.route_mix[k], 0) : 0;
  const pct = (n: number) => (mixTotal ? Math.round((n / mixTotal) * 100) : 0);
  const note = range === "7d" ? "Last 7 days" : "Last 30 days";

  return (
    <div className="stack">
      <PageHead num="04" title="Analytics"><Segmented label="Range" options={RANGES} value={range} onChange={setRange} /></PageHead>
      {summary.isError && <ErrorText>{(summary.error as Error).message}</ErrorText>}
      {s && (
        <>
          <div className="stats">
            <Stat label="REQUESTS" value={<CountUp value={s.total_requests} />} note={note} />
            <Stat label="MEDIAN LATENCY" value={fmtMs(s.latency_ms.median)} note={`p95 ${fmtMs(s.latency_ms.p95)}`} />
            <Stat label="ESTIMATED PROVIDER COST" value={fmtCost(s.total_cost_usd)} note="Estimate from the prices you set on your models" />
            <Stat label="UNANSWERED" value={unanswered.data ? <CountUp value={unanswered.data.total} /> : "—"} note="Weak or no match" />
          </div>
          <div className="split">
            <div className="stack-sm minw0">
              <div className="label">REQUESTS PER DAY</div>
              <ol className="bars" aria-label="Requests per day">
                {days.map((d) => {
                  const t = dayTotal(d);
                  const text = `${fmtDay(d.date)}: ${t} requests, ${d.cheap} cheap, ${d.expensive} expensive, ${d.none} no answer, ${d.failed} failed`;
                  return (
                    <li key={d.date} role="img" aria-label={text} title={text + (d.cost_usd != null ? `, estimated provider cost ${fmtCost(d.cost_usd)}` : "")} className="bar" style={{ height: `${(t / max) * 100}%` }}>
                      <span className="seg seg-failed" style={{ flex: d.failed }} /><span className="seg seg-none" style={{ flex: d.none }} />
                      <span className="seg seg-expensive" style={{ flex: d.expensive }} /><span className="seg seg-cheap" style={{ flex: d.cheap }} />
                    </li>
                  );
                })}
              </ol>
              <div className="legend mono"><span><i className="sw seg-cheap" />CHEAP</span><span><i className="sw seg-expensive" />EXPENSIVE</span><span><i className="sw seg-none" />NO ANSWER</span><span><i className="sw seg-failed" />FAILED</span></div>
              <div className="small muted-3">Estimated provider cost per day: {days.filter((d) => d.cost_usd != null).map((d) => `${fmtDay(d.date)} ${fmtCost(d.cost_usd)}`).join(" · ") || "no price set"}</div>
            </div>
            <div className="stack-sm">
              <div className="label">ROUTE MIX</div>
              <div className="mixbar" aria-hidden="true">{MIX.map(([k, , c]) => <div key={k} className={c} style={{ width: `${(mixTotal ? s.route_mix[k] / mixTotal : 0) * 100}%` }} />)}</div>
              <ul className="list" aria-label="Route mix">
                {MIX.map(([k, label]) => <li key={k}><span>{label}</span><span className="mono muted-2">{pct(s.route_mix[k])}%</span></li>)}
              </ul>
            </div>
          </div>

          <div>
            <div className="label list-head"><span>UNANSWERED QUESTIONS — ADD DOCUMENTS FOR THESE</span><span>BEST MATCH</span></div>
            <ul className="list">
              {(unanswered.data?.items ?? []).map((u) => (
                <li key={u.id}><span>{u.query}</span><span className="mono red">{u.top_score == null ? "no match" : fmtScore(u.top_score)}</span></li>
              ))}
              {unanswered.isSuccess && !unanswered.data.items.length && <li className="muted-3">No unanswered questions in this range.</li>}
            </ul>
          </div>

          <div>
            <div className="label pb">BY MODEL</div>
            <div className="scroll-x">
              <table className="data" aria-label="By model">
                <thead><tr><th>MODEL</th><th>TIER</th><th>REQUESTS</th><th>TOKENS IN / OUT</th><th>FAILURES</th><th>BACKUP / FALLBACK USES</th><th>MEDIAN</th><th>EST. PROVIDER COST</th></tr></thead>
                <tbody>
                  {s.by_model.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.model_id}</td><td>{m.tier}</td><td className="mono">{fmtInt(m.requests)}</td>
                      <td className="mono">{fmtInt(m.tokens_in)} / {fmtInt(m.tokens_out)}</td>
                      <td className="mono">{m.failures.error + m.failures.timeout + m.failures.rate_limited}</td>
                      <td className="mono">{m.backup_uses} / {m.fallback_uses}</td><td className="mono">{fmtMs(m.median_latency_ms)}</td><td className="mono">{fmtCost(m.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!s.by_model.length && <div className="empty small">No models yet. Add one in the Models tab.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return <div className="stat"><div className="label">{label}</div><div className="stat-value">{value}</div><div className="small muted-3">{note}</div></div>;
}
