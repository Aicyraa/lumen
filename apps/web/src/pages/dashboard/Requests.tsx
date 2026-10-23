import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { RouteCard } from "../../components/RouteCard";
import { UsageCard } from "../../components/UsageCard";
import { ErrorText, PageHead, Segmented, StatusDot } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtCost, fmtMs, fmtScore, fmtTime, tierTone } from "../../lib/format";
import type { Range, RequestDetail, RequestRow, RequestsPage } from "../../lib/types";

const TIERS = [["all", "ALL"], ["cheap", "CHEAP"], ["expensive", "EXPENSIVE"], ["none", "NO ANSWER"]] as const;
const RANGES = [["7d", "7D"], ["30d", "30D"]] as const;
type TierFilter = (typeof TIERS)[number][0];

export function Requests() {
  const [tier, setTier] = useState<TierFilter>("all");
  const [range, setRange] = useState<Range>("7d");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useInfiniteQuery({
    queryKey: ["requests", tier, range],
    initialPageParam: "",
    queryFn: ({ pageParam }) => api<RequestsPage>(`/api/dashboard/requests?range=${range}&tier=${tier}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => last.next_cursor ?? undefined, // null = last page
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="stack">
      <PageHead num="05" title="Requests">
        <div className="row-gap">
          <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
          <Segmented label="Route filter" options={TIERS} value={tier} onChange={(t) => { setTier(t); setOpenId(null); }} />
        </div>
      </PageHead>
      <p className="small muted-3">Cost is your estimated provider cost, from the prices you set on each model. Logs hold the question, route and metadata, never document text.</p>
      <div className="scroll-x">
        <div className="table" role="table" aria-label="Request log" style={{ minWidth: 760 }}>
          <div className="tr th req-cols" role="row"><span role="columnheader">TIME</span><span role="columnheader">QUERY</span><span role="columnheader">ROUTE</span><span role="columnheader">K</span><span role="columnheader">EST. COST</span><span role="columnheader">LATENCY</span></div>
          {rows.map((r) => <Row key={r.id} r={r} onOpen={() => setOpenId(r.id)} />)}
          {q.isSuccess && !rows.length && <div className="empty">No requests match this filter.</div>}
        </div>
      </div>
      {q.isError && <ErrorText>{(q.error as Error).message}</ErrorText>}
      {q.hasNextPage && <div><button type="button" className="btn btn-outline" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</button></div>}
      {openId && <Drawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Row({ r, onOpen }: { r: RequestRow; onOpen: () => void }) {
  const label = r.tier ?? "failed";
  return (
    <div className="tr-wrap" role="row">
      <button type="button" className="tr req-cols row-btn" onClick={onOpen} aria-haspopup="dialog" aria-label={`${r.query} — open details`}>
        <span className="mono small muted-3">{fmtTime(r.time)}</span>
        <span className="ellipsis">{r.query}</span>
        <StatusDot tone={tierTone(r.tier)}>{label}</StatusDot>
        <span className="mono muted-2">{r.k ?? "—"}</span>
        <span className="mono muted-2">{r.tier === "none" || (r.tier === null && r.cost_usd === null) ? "—" : fmtCost(r.cost_usd)}</span>
        <span className="mono muted-2">{fmtMs(r.latency_ms)}</span>
      </button>
    </div>
  );
}

function Drawer({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useQuery({ queryKey: ["request", id], queryFn: () => api<RequestDetail>(`/api/dashboard/requests/${id}`) });
  return (
    <Dialog title="Request" label="REQUEST DETAIL" variant="drawer" onClose={onClose}>
      <button type="button" className="btn btn-outline btn-sm drawer-close" onClick={onClose}>Close</button>
      {d.isPending && <div className="muted-3 small">Loading…</div>}
      {d.isError && <ErrorText>{(d.error as Error).message}</ErrorText>}
      {d.data && (
        <div className="stack-sm">
          <p className="body">{d.data.query}</p>
          <RouteCard route={d.data.route} />
          <UsageCard usage={d.data.usage} noModel={d.data.route.tier === "none"}>
            <div className="meta mono small muted-3">
              <span>{d.data.id}</span>
              <span>key · {d.data.api_key ? `${d.data.api_key.name ?? "Untitled key"} (${d.data.api_key.start ?? ""}••••)` : "none (Try it or a deleted key)"}</span>
              {d.data.feedback != null && <span>feedback · {d.data.feedback === 1 ? "helpful" : "not helpful"}</span>}
            </div>
          </UsageCard>
          <div className="card">
            <div className="label">SOURCES</div>
            {d.data.sources.map((s, i) => (
              <div className="source" key={`${s.chunk_id}-${i}`}>
                <span className="mono lime">[{i + 1}]</span>
                <div className="grow">
                  <div>{s.document_deleted ? "deleted document" : (s.filename ?? "passage no longer available")}</div>
                  {s.passage && <div className="small muted-3">{s.passage}</div>}
                </div>
                <span className="mono muted-2">{fmtScore(s.score)}</span>
              </div>
            ))}
            {!d.data.sources.length && <div className="small muted-3">No passages matched. Consider adding a document that covers this.</div>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
