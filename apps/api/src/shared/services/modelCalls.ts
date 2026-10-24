// Turns the Python service's internal `attempts` into model_calls rows, tenant_models status/rate limits and
// the tenant's estimated provider cost. Everything the service sends is validated: it is never trusted with an id.
import { z } from "zod";
import type { Config } from "../config/config.js";
import type { Pool } from "../db/pool.js";
import type { RawAttempt } from "./rag.js";

type Limits = Pick<
  Config,
  "modelAttemptsMax" | "rateLimitHeadersMax" | "providerNameMaxChars" | "modelIdMaxChars"
>;
export interface KnownModel {
  provider: string;
  model_id: string;
  tier: string;
  inputPrice: number | null;
  outputPrice: number | null;
}

const attemptSchema = (c: Limits) =>
  z.object({
    provider: z.string().max(c.providerNameMaxChars),
    model_id: z.string().max(c.modelIdMaxChars),
    tenant_model_id: z.string().nullish().catch(null),
    tier: z.enum(["cheap", "expensive", "default"]).catch("default"),
    outcome: z.enum(["ok", "error", "timeout", "rate_limited"]).catch("error"),
    tokens_in: z.number().int().nonnegative().nullish().catch(null),
    tokens_out: z.number().int().nonnegative().nullish().catch(null),
    latency_ms: z.number().int().nonnegative().nullish().catch(null),
    rate_limits: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .nullish()
      .catch(null),
    reported_cost_usd: z.number().finite().nonnegative().nullish().catch(null),
  });
export type Attempt = z.infer<ReturnType<typeof attemptSchema>> & {
  cost_usd: number | null;
  cost_source: "estimated" | "provider" | null;
  known?: string;
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6; // NUMERIC(12, 6)

// Parses, links to the tenant's own models only, and prices each attempt. Returns the attempts and the request's total.
export function priceAttempts(
  raw: RawAttempt[],
  known: Map<string, KnownModel>,
  limits: Limits,
): { attempts: Attempt[]; total: number | null } {
  const attempts: Attempt[] = [];
  const schema = attemptSchema(limits);
  for (const r of raw.slice(0, limits.modelAttemptsMax)) {
    const p = schema.safeParse(r);
    if (!p.success) continue;
    const a = p.data;
    const id = a.tenant_model_id && known.has(a.tenant_model_id) ? a.tenant_model_id : undefined; // another tenant's id is ignored
    const m = id ? known.get(id)! : undefined;
    let cost: number | null = null;
    let source: Attempt["cost_source"] = null;
    // a provider-reported cost counts only for a call that succeeded
    if (a.outcome === "ok" && a.reported_cost_usd != null) {
      cost = round6(a.reported_cost_usd);
      source = "provider";
    } else if (
      m &&
      m.inputPrice != null &&
      m.outputPrice != null &&
      (a.tokens_in != null || a.tokens_out != null)
    ) {
      cost = round6(
        ((a.tokens_in ?? 0) / 1e6) * m.inputPrice + ((a.tokens_out ?? 0) / 1e6) * m.outputPrice,
      );
      source = "estimated";
    }
    attempts.push({ ...a, cost_usd: cost, cost_source: source, known: id });
  }
  const priced = attempts.filter((a) => a.cost_usd != null);
  return {
    attempts,
    total: priced.length ? round6(priced.reduce((s, a) => s + a.cost_usd!, 0)) : null,
  };
}

// One model_calls row per attempt, then each of the tenant's models gets its status and last-seen limits.
export async function recordAttempts(
  pool: Pool,
  tenantId: string,
  requestId: string,
  attempts: Attempt[],
  cfg: Pick<Limits, "rateLimitHeadersMax">,
) {
  for (const a of attempts) {
    await pool.query(
      `INSERT INTO model_calls (tenant_id, request_id, tenant_model_id, provider, model_id, tier, outcome, tokens_in, tokens_out, latency_ms, cost_usd, cost_source)
       SELECT $1::text, $2::uuid, (SELECT id FROM tenant_models WHERE id = $3::uuid AND tenant_id = $1::text), $4::text, $5::text, $6::text, $7::text, $8::int, $9::int, $10::int, $11::numeric, $12::text
       WHERE EXISTS (SELECT 1 FROM tenants WHERE id = $1::text FOR SHARE)`, // no rows for a project that was deleted meanwhile; a model deleted meanwhile is stored as unknown
      [
        tenantId,
        requestId,
        a.known ?? null,
        a.provider,
        a.model_id,
        a.tier,
        a.outcome,
        a.tokens_in ?? null,
        a.tokens_out ?? null,
        a.latency_ms ?? null,
        a.cost_usd,
        a.cost_source,
      ],
    );
  }
  const last = new Map<string, { ok: boolean; limits: Record<string, string | number> | null }>();
  for (const a of attempts) {
    if (!a.known) continue;
    const prev = last.get(a.known);
    const limits =
      a.rate_limits && Object.keys(a.rate_limits).length
        ? Object.fromEntries(Object.entries(a.rate_limits).slice(0, cfg.rateLimitHeadersMax))
        : (prev?.limits ?? null);
    last.set(a.known, { ok: a.outcome === "ok", limits });
  }
  for (const [id, s] of last) {
    await pool.query(
      `UPDATE tenant_models SET status = $3, rate_limits = COALESCE($4::jsonb, rate_limits),
              rate_limits_seen_at = CASE WHEN $4::jsonb IS NULL THEN rate_limits_seen_at ELSE now() END
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, s.ok ? "connected" : "failing", s.limits ? JSON.stringify(s.limits) : null],
    );
  }
}
