import { fmtCost, fmtInt, fmtMs } from "../lib/format";

// Tokens, latency and the tenant's estimated provider cost ("no price set" when the model has no price).
export function UsageCard({ usage, children }: { usage: { tokens_in: number | null; tokens_out: number | null; latency_ms: number | null; cost_usd: number | null }; children?: React.ReactNode }) {
  return (
    <div className="card card-usage">
      <div className="label">USAGE</div>
      <dl className="kv">
        <div><dt>TOKENS IN</dt><dd>{fmtInt(usage.tokens_in)}</dd></div>
        <div><dt>TOKENS OUT</dt><dd>{fmtInt(usage.tokens_out)}</dd></div>
        <div><dt>LATENCY</dt><dd>{fmtMs(usage.latency_ms)}</dd></div>
        <div><dt>ESTIMATED PROVIDER COST</dt><dd>{fmtCost(usage.cost_usd)}</dd></div>
      </dl>
      {children}
    </div>
  );
}
