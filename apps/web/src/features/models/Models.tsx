import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api, post } from "../../shared/lib/api";
import { fmtCost, fmtDate, fmtInt, fmtMs } from "../../shared/lib/format";
import type {
  ModelsGrouped,
  ModelsUsage,
  ModelTier,
  ModelUsage,
  Provider,
  Range,
  TenantModel,
} from "../../shared/lib/types";
import { Dialog } from "../../shared/ui/Dialog";
import { InfoTip } from "../../shared/ui/InfoTip";
import { StatusMessage } from "../../shared/ui/StatusMessage";
import { ErrorText, PageHead, Segmented, StatusDot } from "../../shared/ui/ui";
import { useOrgId } from "../auth/session";

const PROVIDERS: readonly (readonly [Provider, string])[] = [
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["google", "Google"],
  ["openai_compatible", "OpenAI-compatible"],
];
// Starting endpoints only; the tenant can edit the field. The API validates and refuses unsafe URLs.
const ENDPOINTS: Record<Provider, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1/",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openai_compatible: "https://",
};
const TIERS: readonly (readonly [ModelTier, string])[] = [
  ["cheap", "CHEAP"],
  ["expensive", "EXPENSIVE"],
];
const RANGES = [
  ["7d", "7D"],
  ["30d", "30D"],
] as const;
const GROUPS: {
  tier: ModelTier;
  title: string;
  note: string;
  tip: string;
  empty: string;
  tone: "ready" | "cheap";
}[] = [
  {
    tier: "cheap",
    title: "Cheap",
    tone: "ready",
    note: "Easy questions. Tried top to bottom.",
    tip: "Easy questions go here first. The models in this tier are tried top to bottom.",
    empty: "No cheap model. Easy questions will use the expensive tier.",
  },
  {
    tier: "expensive",
    title: "Expensive",
    tone: "cheap",
    note: "Hard questions and escalations. Tried top to bottom.",
    tip: "Hard questions and escalations from the cheap tier go here. The models are tried top to bottom.",
    empty: "No expensive model. Hard questions will use the cheap tier.",
  },
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
  const org = useOrgId();
  const [range, setRange] = useState<Range>("7d");
  const [open, setOpen] = useState(false);
  const models = useQuery({
    queryKey: ["models", org],
    enabled: !!org,
    queryFn: () => api<{ models: ModelsGrouped }>("/api/dashboard/models").then((r) => r.models),
  });
  const usage = useQuery({
    queryKey: ["models-usage", org, range],
    enabled: !!org,
    queryFn: () => api<ModelsUsage>(`/api/dashboard/models/usage?range=${range}`),
  });
  const anyPriced = Object.values(models.data ?? {}).some((rows) =>
    rows.some((m) => m.input_price_per_1m != null || m.output_price_per_1m != null),
  );
  const byId = new Map<string, ModelUsage>((usage.data?.models ?? []).map((u) => [u.id, u]));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["models", org] });
    qc.invalidateQueries({ queryKey: ["models-usage", org] });
  };
  const [rowError, setRowError] = useState("");

  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) =>
      api(`/api/dashboard/models/${id}`, { method: "PATCH", body: JSON.stringify({ direction }) }),
    onSuccess: refresh,
    onError: (e: Error) => setRowError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/dashboard/models/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e: Error) => setRowError(e.message),
  });

  return (
    <div className="stack">
      <PageHead title="Models">
        <div className="row-gap">
          <Segmented label="Usage range" options={RANGES} value={range} onChange={setRange} />
          <button
            type="button"
            className="btn btn-primary"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Add model
          </button>
        </div>
      </PageHead>
      {usage.data && (
        <div className="mono small muted-3">
          ESTIMATED PROVIDER COST, {range.toUpperCase()}:{" "}
          {fmtCost(usage.data.total_cost_usd ?? (anyPriced ? 0 : null))}
        </div>
      )}
      {open && (
        <Dialog title="Add model" label="NEW MODEL" onClose={() => setOpen(false)}>
          <AddModel
            onDone={() => {
              setOpen(false);
              refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        </Dialog>
      )}
      <ErrorText>{rowError}</ErrorText>
      {usage.isError && (
        <div role="alert" className="error-text">
          Could not load usage. {(usage.error as Error).message}{" "}
          <button type="button" className="link-btn red" onClick={() => usage.refetch()}>
            Retry
          </button>
        </div>
      )}
      {models.isPending && <StatusMessage state="loading">Loading models…</StatusMessage>}
      {models.isError && (
        <StatusMessage state="error" onRetry={() => models.refetch()}>
          Could not load models. {(models.error as Error).message}
        </StatusMessage>
      )}
      {models.isSuccess && (
        <div className="models-grid">
          {GROUPS.map((g) => {
            const rows = models.data?.[g.tier] ?? [];
            const allLimited = rows.length > 0 && rows.every((m) => limitedUntil(byId.get(m.id)));
            return (
              <section key={g.tier} className="card tier-card" aria-labelledby={`g-${g.tier}`}>
                <div className="group-head">
                  <div className="row-gap-sm">
                    <span className={`dot status-${g.tone}`} aria-hidden="true" />
                    <h2 id={`g-${g.tier}`} className="group-title">
                      {g.title}
                    </h2>
                    <span className="mono small muted-4">
                      {rows.length} {rows.length === 1 ? "MODEL" : "MODELS"}
                    </span>
                    <InfoTip label={`About the ${g.tier} tier`}>{g.tip}</InfoTip>
                  </div>
                  <div className="small muted-3">{g.note}</div>
                </div>
                {rows.length > 0 && (
                  <div className="model-row model-head" role="row">
                    {["MODEL", "ENDPOINT", "STATUS", "USAGE", "LIMITS", "COST", ""].map((h) => (
                      <span key={h || "actions"} role="columnheader">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
                {rows.map((m, i) => (
                  <ModelRow
                    key={m.id}
                    m={m}
                    u={byId.get(m.id)}
                    usageFailed={usage.isError}
                    rank={i === 0 ? "PRIMARY" : `BACKUP ${i}`}
                    first={i === 0}
                    last={i === rows.length - 1}
                    onMove={(direction) => move.mutate({ id: m.id, direction })}
                    onRemove={() => remove.mutate(m.id)}
                  />
                ))}
                {allLimited && (
                  <p className="small muted-3 tier-hint">
                    Every model in this tier is rate limited. Add a backup model from another
                    provider to keep answering.
                  </p>
                )}
                {!rows.length && <div className="card-empty">{g.empty}</div>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The ISO time while the provider still asks us to wait, else null (a time already past counts as over).
const limitedUntil = (u?: ModelUsage) =>
  u?.rate_limited_until && Date.parse(u.rate_limited_until) > Date.now()
    ? new Date(u.rate_limited_until)
    : null;

function remainingText(until: Date) {
  const min = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  if (min >= 90) return `about ${Math.round(min / 60)} hours left`;
  return `about ${min} ${min === 1 ? "minute" : "minutes"} left`;
}

function limitsText(u?: ModelUsage) {
  if (!u?.rate_limits || !Object.keys(u.rate_limits).length) return "provider limits: not reported";
  const parts = Object.entries(u.rate_limits).map(
    ([k, v]) => `${k.replace(/^x-ratelimit-/, "")} ${String(v)}`,
  );
  return `provider limits: ${parts.join(" · ")}${u.rate_limits_seen_at ? ` (seen ${fmtDate(u.rate_limits_seen_at)})` : ""}`;
}

function ModelRow({
  m,
  u,
  usageFailed,
  rank,
  first,
  last,
  onMove,
  onRemove,
}: {
  m: TenantModel;
  u?: ModelUsage;
  usageFailed: boolean;
  rank: string;
  first: boolean;
  last: boolean;
  onMove: (d: "up" | "down") => void;
  onRemove: () => void;
}) {
  const until = limitedUntil(u);
  const fails = u ? u.failures.error + u.failures.timeout + u.failures.rate_limited : 0;
  return (
    <div className="model-row" role="row" data-testid={`model-${m.id}`}>
      <div className="model-cell" role="cell">
        <span className={`mono small rank${first ? " lime" : " muted-3"}`}>{rank}</span>
        <span className="mono wrap-any">{m.model_id}</span>
        <span className="small muted-3">{PROVIDERS.find((p) => p[0] === m.provider)?.[1]}</span>
      </div>
      <div className="model-cell" role="cell">
        <span className="mono small wrap-any">{m.endpoint_url}</span>
        <span className="mono small muted-3">{m.key_hint}</span>
      </div>
      <div className="model-cell" role="cell">
        {until ? (
          <span title={`Rate limited by the provider, ${remainingText(until)}`}>
            <StatusDot tone="processing">
              Rate limited until{" "}
              {until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </StatusDot>
          </span>
        ) : (
          <StatusDot tone={m.status === "connected" ? "ready" : "failed"}>
            {m.status === "connected" ? "Connected" : "Failing"}
          </StatusDot>
        )}
      </div>
      <div className="model-cell small muted-3" role="cell">
        {u ? (
          <>
            {fmtInt(u.requests)} {u.requests === 1 ? "request" : "requests"} · {fmtInt(u.tokens_in)}{" "}
            in / {fmtInt(u.tokens_out)} out tokens · {fails} failures
            {fails
              ? ` (${u.failures.error} error, ${u.failures.timeout} timeout, ${u.failures.rate_limited} rate limited)`
              : ""}
            · {u.backup_uses} as backup · median {fmtMs(u.median_latency_ms)}
          </>
        ) : usageFailed ? (
          "usage unavailable"
        ) : (
          "usage loading…"
        )}
      </div>
      <div className="model-cell small muted-3" role="cell">
        {limitsText(u)}
      </div>
      <div className="model-cell small muted-3" role="cell">
        <span>
          estimated provider cost{" "}
          <InfoTip label="About estimated provider cost">
            Estimated from the prices you enter for each model.
          </InfoTip>{" "}
          <span className="mono text">
            {fmtCost(
              u?.cost_usd ??
                (m.input_price_per_1m != null || m.output_price_per_1m != null ? 0 : null),
            )}
          </span>
        </span>
        {(m.input_price_per_1m != null || m.output_price_per_1m != null) && (
          <span>
            price per 1M tokens: in {m.input_price_per_1m ?? "—"}, out{" "}
            {m.output_price_per_1m ?? "—"}
          </span>
        )}
      </div>
      <div className="model-cell model-actions" role="cell">
        <button
          type="button"
          className="circle-btn"
          disabled={first}
          aria-label={`Move ${m.model_id} up`}
          onClick={() => onMove("up")}
        >
          ↑
        </button>
        <button
          type="button"
          className="circle-btn"
          disabled={last}
          aria-label={`Move ${m.model_id} down`}
          onClick={() => onMove("down")}
        >
          ↓
        </button>
        <button
          type="button"
          className="link-btn danger-hover"
          aria-label={`Remove ${m.model_id}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
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

  // gcTime 0 and reset(): the request body (with api_key) must not linger in the mutation cache.
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => post("/api/dashboard/models", body),
    gcTime: 0,
    onSuccess: onDone,
    onError: (e: Error) => setError(e.message),
    onSettled: () => queueMicrotask(() => save.reset()),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const input = parsePrice(inPrice),
      output = parsePrice(outPrice);
    if (input === "invalid" || output === "invalid")
      return setError("Price must be a number of 0 or more, or left empty.");
    if (!modelId.trim() || !key.trim() || !/^https?:\/\/.+/.test(endpoint.trim()))
      return setError("Enter a model ID, a full endpoint URL and an API key.");
    const apiKey = key.trim();
    setKey(""); // write-only: the key leaves the page the moment it is submitted, on success and on failure
    save.mutate({
      provider,
      model_id: modelId.trim(),
      endpoint_url: endpoint.trim(),
      api_key: apiKey,
      tier,
      ...(input !== undefined ? { input_price_per_1m: input } : {}),
      ...(output !== undefined ? { output_price_per_1m: output } : {}),
    });
  }

  return (
    <form className="stack-sm" onSubmit={submit} autoComplete="off">
      <div className="field">
        <span>Provider</span>
        <Segmented
          label="Provider"
          options={PROVIDERS}
          value={provider}
          onChange={(p) => {
            setProvider(p);
            setEndpoint(ENDPOINTS[p]);
          }}
          pills
        />
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Model ID</span>
          <input value={modelId} onChange={(e) => setModelId(e.target.value)} className="mono" />
        </label>
        <label className="field">
          <span>Endpoint URL</span>
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="mono" />
        </label>
        <label className="field span-2">
          <span>API key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mono"
            autoComplete="new-password"
            placeholder="Stored encrypted, never shown again"
          />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Input price per 1M tokens (optional)</span>
          <input
            inputMode="decimal"
            value={inPrice}
            onChange={(e) => setInPrice(e.target.value)}
            className="mono"
            placeholder="e.g. 0.10"
          />
        </label>
        <label className="field">
          <span>Output price per 1M tokens (optional)</span>
          <input
            inputMode="decimal"
            value={outPrice}
            onChange={(e) => setOutPrice(e.target.value)}
            className="mono"
            placeholder="e.g. 0.40"
          />
        </label>
        <p className="small muted-3 span-2">
          Used only to estimate your provider cost. Leave empty to show "no price set".
        </p>
      </div>
      <div className="field">
        <span>Use as</span>
        <div className="row-gap">
          <Segmented label="Use as" options={TIERS} value={tier} onChange={setTier} />
          <span className="small muted-3">Added to the end of the tier. Reorder it below.</span>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="row-end form-foot">
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Testing connection…" : "Test & save"}
        </button>
      </div>
    </form>
  );
}
