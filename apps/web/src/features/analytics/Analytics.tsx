import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../shared/lib/api";
import { fmtCost, fmtDay, fmtInt, fmtMs, fmtScore } from "../../shared/lib/format";
import type { Range, Summary, Unanswered, UnansweredGroup } from "../../shared/lib/types";
import { CountUp } from "../../shared/motion/motion";
import { useInViewOnce } from "../../shared/motion/useInViewOnce";
import { StatusMessage } from "../../shared/ui/StatusMessage";
import { PageHead, Segmented } from "../../shared/ui/ui";
import { useOrgId } from "../auth/session";

const RANGES = [
  ["7d", "7D"],
  ["30d", "30D"],
] as const;

const MIX = [
  ["cheap", "Cheap", "mix-cheap"],
  ["escalated", "Escalated (caution)", "mix-escalated"],
  ["expensive_hard", "Expensive (hard)", "mix-expensive"],
  ["none", "No answer — no model called", "mix-none"],
  ["failed", "Failed — provider error or rate limit", "mix-failed"],
] as const;

export function Analytics() {
  const [range, setRange] = useState<Range>("7d");
  const org = useOrgId();
  const summary = useQuery({
    queryKey: ["summary", org, range],
    enabled: !!org,
    queryFn: () => api<Summary>(`/api/dashboard/analytics/summary?range=${range}`),
  });
  const unanswered = useQuery({
    queryKey: ["unanswered", org, range],
    enabled: !!org,
    queryFn: () => api<Unanswered>(`/api/dashboard/analytics/unanswered?range=${range}`),
  });
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  const s = summary.data;
  const days = s?.per_day ?? [];
  const dayTotal = (d: Summary["per_day"][number]) => d.cheap + d.expensive + d.none + d.failed;
  const max = Math.max(1, ...days.map(dayTotal));
  const mixTotal = s ? MIX.reduce((a, [k]) => a + s.route_mix[k], 0) : 0;
  const pct = (n: number) => (mixTotal ? Math.round((n / mixTotal) * 100) : 0);
  const note = range === "7d" ? "Last 7 days" : "Last 30 days";

  return (
    <div className={`stack an${seen ? " in-view" : ""}`} ref={ref}>
      <PageHead title="Analytics">
        <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
      </PageHead>
      {summary.isPending && <StatusMessage state="loading">Loading analytics…</StatusMessage>}
      {summary.isError && (
        <StatusMessage
          state="error"
          onRetry={() => {
            summary.refetch();
            unanswered.refetch();
          }}
        >
          Could not load analytics. {(summary.error as Error).message}
        </StatusMessage>
      )}
      {s && (
        <div className="an-body">
          <div className="an-stats">
            <Stat label="REQUESTS" value={<CountUp value={s.total_requests} />} note={note} />
            <Stat
              label="MEDIAN LATENCY"
              value={fmtMs(s.latency_ms.median)}
              note={`p95 ${fmtMs(s.latency_ms.p95)}`}
            />
            <Stat
              label="ESTIMATED PROVIDER COST"
              value={fmtCost(s.total_cost_usd)}
              note="Estimate from the prices you set on your models"
            />
            <Stat
              label="UNANSWERED"
              value={
                unanswered.data ? (
                  <CountUp
                    value={unanswered.data.no_match.total + unanswered.data.not_found.total}
                  />
                ) : (
                  "—"
                )
              }
              note="Weak or no match"
            />
          </div>
          <div className="an-row an-row-top">
            <section className="card" aria-labelledby="an-chart">
              <h2 className="card-title" id="an-chart">
                Requests per day
              </h2>
              {s.total_requests === 0 || !days.length ? (
                <div className="card-empty">No requests in this range yet.</div>
              ) : (
                <>
                  <ol className="bars" aria-label="Requests per day">
                    {days.map((d) => {
                      const t = dayTotal(d);
                      const text = `${fmtDay(d.date)}: ${t} requests, ${d.cheap} cheap, ${d.expensive} expensive, ${d.none} no answer, ${d.failed} failed`;
                      return (
                        <li
                          key={d.date}
                          role="img"
                          aria-label={text}
                          title={
                            text +
                            (d.cost_usd != null
                              ? `, estimated provider cost ${fmtCost(d.cost_usd)}`
                              : "")
                          }
                          className="bar"
                          style={{ height: `${(t / max) * 100}%` }}
                        >
                          <span className="seg seg-failed" style={{ flex: d.failed }} />
                          <span className="seg seg-none" style={{ flex: d.none }} />
                          <span className="seg seg-expensive" style={{ flex: d.expensive }} />
                          <span className="seg seg-cheap" style={{ flex: d.cheap }} />
                        </li>
                      );
                    })}
                  </ol>
                  <div className="legend mono">
                    <span>
                      <i className="sw seg-cheap" />
                      CHEAP
                    </span>
                    <span>
                      <i className="sw seg-expensive" />
                      EXPENSIVE
                    </span>
                    <span>
                      <i className="sw seg-none" />
                      NO ANSWER
                    </span>
                    <span>
                      <i className="sw seg-failed" />
                      FAILED
                    </span>
                  </div>
                </>
              )}
              <div className="small muted-3">
                Estimated provider cost per day:{" "}
                {days
                  .filter((d) => d.cost_usd != null)
                  .map((d) => `${fmtDay(d.date)} ${fmtCost(d.cost_usd)}`)
                  .join(" · ") || "no price set"}
              </div>
            </section>
            <section className="card" aria-labelledby="an-mix">
              <h2 className="card-title" id="an-mix">
                Route mix
              </h2>
              <div className="mixbar" aria-hidden="true">
                {MIX.map(([k, , c]) => (
                  <div
                    key={k}
                    className={c}
                    style={{ width: `${(mixTotal ? s.route_mix[k] / mixTotal : 0) * 100}%` }}
                  />
                ))}
              </div>
              {mixTotal === 0 && <div className="small muted-3">No routed requests yet.</div>}
              <ul className="list" aria-label="Route mix">
                {MIX.map(([k, label]) => (
                  <li key={k}>
                    <span>{label}</span>
                    <span className="mono muted-2">{pct(s.route_mix[k])}%</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="an-row an-row-bottom">
            <section className="card" aria-labelledby="an-models">
              <h2 className="card-title" id="an-models">
                By model
              </h2>
              {!s.by_model.length ? (
                <div className="card-empty">No models yet. Add one in the Models tab.</div>
              ) : (
                <div className="scroll-x">
                  <table className="data" aria-label="By model">
                    <thead>
                      <tr>
                        <th>MODEL</th>
                        <th>TIER</th>
                        <th>REQUESTS</th>
                        <th>TOKENS IN / OUT</th>
                        <th>FAILURES</th>
                        <th>BACKUP USES</th>
                        <th>MEDIAN</th>
                        <th>EST. PROVIDER COST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.by_model.map((m) => (
                        <tr key={m.id}>
                          <td className="mono">{m.model_id}</td>
                          <td>{m.tier}</td>
                          <td className="mono">{fmtInt(m.requests)}</td>
                          <td className="mono">
                            {fmtInt(m.tokens_in)} / {fmtInt(m.tokens_out)}
                          </td>
                          <td className="mono">
                            {m.failures.error + m.failures.timeout + m.failures.rate_limited}
                          </td>
                          <td className="mono">{m.backup_uses}</td>
                          <td className="mono">{fmtMs(m.median_latency_ms)}</td>
                          <td className="mono">
                            {m.requests === 0 && m.cost_usd == null
                              ? "no usage yet"
                              : fmtCost(m.cost_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          <div className="an-row an-row-unanswered">
            <UnansweredCard
              id="an-no-match"
              title="No match"
              hint={`No model was called, or the best match scored below ${unanswered.data ? fmtScore(unanswered.data.threshold) : "the threshold"}. Add documents that cover these.`}
              empty="Nothing without a match in this range."
              query={unanswered}
              group={unanswered.data?.no_match}
            >
              {(u) => (
                <li key={u.id}>
                  <span className="grow ellipsis" title={u.query}>
                    {u.query}
                  </span>
                  <span className="mono red">
                    {u.top_score == null ? "no match" : fmtScore(u.top_score)}
                  </span>
                </li>
              )}
            </UnansweredCard>
            <UnansweredCard
              id="an-not-found"
              title="Not found"
              hint="A model answered, but found nothing in your documents. These matched loosely, so a document may need rewording or adding."
              empty="Nothing marked not found in this range."
              query={unanswered}
              group={unanswered.data?.not_found}
            >
              {(u) => (
                <li key={u.id} className="un-row">
                  <span className="grow ellipsis" title={u.query}>
                    {u.query}
                  </span>
                  <span className="mono red">{fmtScore(u.top_score)}</span>
                  <span className="un-meta mono">
                    <span>
                      {u.model ? `${u.model.provider} / ${u.model.model_id}` : "model not recorded"}
                    </span>
                    {u.difficulty != null && <span>difficulty {fmtScore(u.difficulty)}</span>}
                    {u.escalated && <span className="un-esc">escalated</span>}
                  </span>
                </li>
              )}
            </UnansweredCard>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="small muted-3">{note}</div>
    </div>
  );
}

function UnansweredCard<T extends { id: string }>({
  id,
  title,
  hint,
  empty,
  query,
  group,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  empty: string;
  query: UseQueryResult<Unanswered>;
  group: UnansweredGroup<T> | undefined;
  children: (item: T) => React.ReactNode;
}) {
  return (
    <section className="card" aria-labelledby={id}>
      <h2 className="card-title" id={id}>
        {title}
      </h2>
      <div className="small muted-3">{hint}</div>
      {query.isPending && <div className="card-empty">Loading…</div>}
      {query.isError && (
        <div className="card-empty">
          Could not load unanswered questions.{" "}
          <button type="button" className="link-btn" onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {group && !group.items.length && <div className="card-empty">{empty}</div>}
      {group && group.items.length > 0 && <ul className="list">{group.items.map(children)}</ul>}
    </section>
  );
}
