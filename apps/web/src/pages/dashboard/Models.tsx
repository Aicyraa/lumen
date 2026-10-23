import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ErrorText, PageHead, Segmented, StatusDot } from "../../components/ui";
import { api, post } from "../../lib/api";
import { fmtCost, fmtDate, fmtInt, fmtMs } from "../../lib/format";
import type { ModelsGrouped, ModelsUsage, ModelTier, ModelUsage, Provider, Range, TenantModel } from "../../lib/types";

const PROVIDERS: readonly (readonly [Provider, string])[] = [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["google", "Google"], ["openai_compatible", "OpenAI-compatible"]];
// Starting endpoints only; the tenant can edit the field. The API validates and refuses unsafe URLs.
const ENDPOINTS: Record<Provider, string> = {
  openai: "https://api.openai.com/v1", anthropic: "https://api.anthropic.com/v1/",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/", openai_compatible: "https://",
};
const TIERS: readonly (readonly [ModelTier, string])[] = [["cheap", "CHEAP"], ["expensive", "EXPENSIVE"], ["fallback", "FALLBACK"]];
const RANGES = [["7d", "7D"], ["30d", "30D"]] as const;
const GROUPS: { tier: ModelTier; title: string; note: string; empty: string; tone: "ready" | "cheap" | "processing" }[] = [
  { tier: "cheap", title: "Cheap", tone: "ready", note: "Easy questions. Tried top to bottom.", empty: "No cheap model. Easy questions will use the expensive tier." },
  { tier: "expensive", title: "Expensive", tone: "cheap", note: "Hard questions and escalations. Tried top to bottom.", empty: "No expensive model. Hard questions will use the cheap tier." },
  { tier: "fallback", title: "Fallback", tone: "processing", note: "Used when every model in a tier fails or times out.", empty: "No fallback. If every model in a tier fails, the request returns an error." },
];

// Empty means "no price"; otherwise a number of 0 or more.
function parsePrice(raw: string): number | undefined | "invalid" {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

export function Models() {
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("7d");
  const [open, setOpen] = useState(false);
  const models = useQuery({ queryKey: ["models"], queryFn: () => api<{ models: ModelsGrouped }>("/api/dashboard/models").then((r) => r.models) });
  const usage = useQuery({ queryKey: ["models-usage", range], queryFn: () => api<ModelsUsage>(`/api/dashboard/models/usage?range=${range}`) });
  const byId = new Map<string, ModelUsage>((usage.data?.models ?? []).map((u) => [u.id, u]));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["models"] }); qc.invalidateQueries({ queryKey: ["models-usage"] }); };
  const [rowError, setRowError] = useState("");

  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => api(`/api/dashboard/models/${id}`, { method: "PATCH", body: JSON.stringify({ direction }) }),
    onSuccess: refresh, onError: (e: Error) => setRowError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/dashboard/models/${id}`, { method: "DELETE" }),
    onSuccess: refresh, onError: (e: Error) => setRowError(e.message),
  });

  return (
    <div className="stack">
      <PageHead num="06" title="Models">
        <div className="row-gap">
          <Segmented label="Usage range" options={RANGES} value={range} onChange={setRange} />
          <button type="button" className="btn btn-primary" aria-expanded={open} onClick={() => setOpen(!open)}>Add model</button>
        </div>
      </PageHead>
      <p className="body muted-2 maxw">Connect your own provider keys. Easy questions go to the cheap tier and hard ones to the expensive tier. Each tier tries its models top to bottom; if all of them fail, the fallback answers. Cost figures are your estimated provider cost, from the prices you enter for each model.</p>
      {usage.data && <div className="mono small muted-3">ESTIMATED PROVIDER COST, {range.toUpperCase()}: {fmtCost(usage.data.total_cost_usd)}</div>}
      {open && <AddModel onDone={() => { setOpen(false); refresh(); }} onCancel={() => setOpen(false)} />}
      <ErrorText>{rowError}</ErrorText>
      {models.isError && <ErrorText>{(models.error as Error).message}</ErrorText>}
      <div className="stack-lg">
        {GROUPS.map((g) => {
          const rows = models.data?.[g.tier] ?? [];
          return (
            <section key={g.tier} className="group" aria-labelledby={`g-${g.tier}`}>
              <div className="group-head">
                <div className="row-gap-sm"><span className={`dot status-${g.tone}`} aria-hidden="true" /><h2 id={`g-${g.tier}`} className="group-title">{g.title}</h2><span className="mono small muted-4">{rows.length} {rows.length === 1 ? "MODEL" : "MODELS"}</span></div>
                <div className="small muted-3">{g.note}</div>
              </div>
              {rows.map((m, i) => (
                <ModelRow key={m.id} m={m} u={byId.get(m.id)} rank={i === 0 ? "PRIMARY" : `BACKUP ${i}`} first={i === 0} last={i === rows.length - 1}
                  onMove={(direction) => move.mutate({ id: m.id, direction })} onRemove={() => remove.mutate(m.id)} />
              ))}
              {models.isSuccess && !rows.length && <div className="empty small">{g.empty}</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function limitsText(u?: ModelUsage) {
  if (!u?.rate_limits || !Object.keys(u.rate_limits).length) return "provider limits: not reported";
  const parts = Object.entries(u.rate_limits).map(([k, v]) => `${k.replace(/^x-ratelimit-/, "")} ${String(v)}`);
  return `provider limits: ${parts.join(" · ")}${u.rate_limits_seen_at ? ` (seen ${fmtDate(u.rate_limits_seen_at)})` : ""}`;
}

function ModelRow({ m, u, rank, first, last, onMove, onRemove }: { m: TenantModel; u?: ModelUsage; rank: string; first: boolean; last: boolean; onMove: (d: "up" | "down") => void; onRemove: () => void }) {
  const fails = u ? u.failures.error + u.failures.timeout + u.failures.rate_limited : 0;
  return (
    <div className="model-row" data-testid={`model-${m.id}`}>
      <span className={`mono small rank${first ? " lime" : " muted-3"}`}>{rank}</span>
      <div className="model-main">
        <div className="row-gap-sm"><span className="mono">{m.model_id}</span><span className="small muted-3">{PROVIDERS.find((p) => p[0] === m.provider)?.[1]}</span></div>
        <div className="mono small muted-3 ellipsis">{m.endpoint_url} · {m.key_hint}</div>
        <div className="small muted-3">
          {u ? <>
            {fmtInt(u.requests)} {u.requests === 1 ? "request" : "requests"} · {fmtInt(u.tokens_in)} in / {fmtInt(u.tokens_out)} out tokens · {fails} failures{fails ? ` (${u.failures.error} error, ${u.failures.timeout} timeout, ${u.failures.rate_limited} rate limited)` : ""}
            {m.tier === "fallback" ? ` · ${u.fallback_uses} as fallback` : ` · ${u.backup_uses} as backup`} · median {fmtMs(u.median_latency_ms)}
          </> : "usage loading…"}
        </div>
        <div className="small muted-3">{limitsText(u)}</div>
        <div className="small muted-3">
          price per 1M tokens: {m.input_price_per_1m == null && m.output_price_per_1m == null ? "none set" : `in ${m.input_price_per_1m ?? "—"}, out ${m.output_price_per_1m ?? "—"}`} · estimated provider cost{" "}
          <span className="mono text">{fmtCost(u?.cost_usd)}</span>
        </div>
      </div>
      <StatusDot tone={m.status === "connected" ? "ready" : "failed"}>{m.status === "connected" ? "Connected" : "Failing"}</StatusDot>
      <div className="row-gap-sm">
        <button type="button" className="circle-btn" disabled={first} aria-label={`Move ${m.model_id} up`} onClick={() => onMove("up")}>↑</button>
        <button type="button" className="circle-btn" disabled={last} aria-label={`Move ${m.model_id} down`} onClick={() => onMove("down")}>↓</button>
      </div>
      <button type="button" className="link-btn danger-hover" aria-label={`Remove ${m.model_id}`} onClick={onRemove}>Remove</button>
    </div>
  );
}

function AddModel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [modelId, setModelId] = useState("");
  const [endpoint, setEndpoint] = useState(ENDPOINTS.openai);
  const [key, setKey] = useState("");
  const [tier, setTier] = useState<ModelTier>("cheap");
  const [inPrice, setInPrice] = useState("");
  const [outPrice, setOutPrice] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => post("/api/dashboard/models", body), onSuccess: onDone, onError: (e: Error) => setError(e.message) });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const input = parsePrice(inPrice), output = parsePrice(outPrice);
    if (input === "invalid" || output === "invalid") return setError("Price must be a number of 0 or more, or left empty.");
    if (!modelId.trim() || !key.trim() || !/^https?:\/\/.+/.test(endpoint.trim())) return setError("Enter a model ID, a full endpoint URL and an API key.");
    const apiKey = key.trim();
    setKey(""); // write-only: the key leaves the page the moment it is submitted, on success and on failure
    save.mutate({
      provider, model_id: modelId.trim(), endpoint_url: endpoint.trim(), api_key: apiKey, tier,
      ...(input !== undefined ? { input_price_per_1m: input } : {}), ...(output !== undefined ? { output_price_per_1m: output } : {}),
    });
  }

  return (
    <form className="card form-card" onSubmit={submit} aria-label="Add model" autoComplete="off">
      <div className="label">ADD MODEL</div>
      <div className="field"><span>Provider</span>
        <Segmented label="Provider" options={PROVIDERS} value={provider} onChange={(p) => { setProvider(p); setEndpoint(ENDPOINTS[p]); }} pills />
      </div>
      <div className="grid-3">
        <label className="field"><span>Model ID</span><input value={modelId} onChange={(e) => setModelId(e.target.value)} className="mono" /></label>
        <label className="field"><span>Endpoint URL</span><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="mono" /></label>
        <label className="field"><span>API key</span><input type="password" value={key} onChange={(e) => setKey(e.target.value)} className="mono" autoComplete="new-password" placeholder="Stored encrypted, never shown again" /></label>
      </div>
      <div className="grid-3">
        <label className="field"><span>Input price per 1M tokens (optional)</span><input inputMode="decimal" value={inPrice} onChange={(e) => setInPrice(e.target.value)} className="mono" placeholder="e.g. 0.10" /></label>
        <label className="field"><span>Output price per 1M tokens (optional)</span><input inputMode="decimal" value={outPrice} onChange={(e) => setOutPrice(e.target.value)} className="mono" placeholder="e.g. 0.40" /></label>
        <p className="small muted-3 self-end">Used only to estimate your provider cost. Leave empty to show "no price set".</p>
      </div>
      <div className="field"><span>Use as</span>
        <div className="row-gap"><Segmented label="Use as" options={TIERS} value={tier} onChange={setTier} /><span className="small muted-3">Added to the end of the tier. Reorder it below.</span></div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="row-end form-foot">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Testing connection…" : "Test & save"}</button>
      </div>
    </form>
  );
}
