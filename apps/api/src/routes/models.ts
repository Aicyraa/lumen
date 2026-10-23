import { Router } from "express";
import { z } from "zod";
import { encryptSecret, maskKey } from "../lib/crypto.js";
import { assertEndpoint, EndpointError } from "../lib/endpointGuard.js";
import { ApiError } from "../lib/errors.js";
import { testCompletion } from "../services/provider.js";
import type { Deps } from "../types/types.js";
import "../types/types.js";

const TIERS = ["cheap", "expensive", "fallback"] as const;
// Never select api_key_encrypted here: the list and every response are built from these columns only.
const PUBLIC = "id, tier, position, provider, model_id, endpoint_url, key_hint, status, input_price_per_1m::float8 AS input_price_per_1m, output_price_per_1m::float8 AS output_price_per_1m";
const RANGES: Record<string, string> = { "7d": "7 days", "30d": "30 days" };

// Dashboard Models tab. Every statement filters by tenant_id; another tenant's id is a 404.
export function modelsRouter({ pool, config, resolveHost }: Deps) {
  const r = Router();
  // tenant-entered price per 1M tokens (their own provider's rate, used only for the estimated provider cost); NUMERIC(12, 6)
  const price = z.number().min(0).max(config.maxPricePerMillion);
  const addBody = z.object({
    provider: z.enum(["openai", "anthropic", "google", "openai_compatible"]),
    model_id: z.string().trim().min(1).max(config.modelIdMaxChars),
    endpoint_url: z.string().trim().min(1).max(config.endpointUrlMaxChars),
    api_key: z.string().trim().min(config.apiKeyMinChars).max(config.apiKeyMaxChars), // the minimum keeps the masked hint from revealing the key
    tier: z.enum(TIERS),
    input_price_per_1m: price.nullish(),
    output_price_per_1m: price.nullish(),
  }); // unknown fields (such as tenant_id) are ignored: the tenant is always req.tenantId

  async function grouped(tenantId: string) {
    const { rows } = await pool.query(`SELECT ${PUBLIC} FROM tenant_models WHERE tenant_id = $1 ORDER BY tier, position`, [tenantId]);
    return Object.fromEntries(TIERS.map((t) => [t, rows.filter((m) => m.tier === t)]));
  }

  r.get("/", async (req, res) => {
    res.json({ models: await grouped(req.tenantId) });
  });

  // Per-model usage for the range, from model_calls. Every table is filtered by tenant_id, including the
  // subquery that finds earlier attempts of the same request.
  r.get("/usage", async (req, res) => {
    const range = z.enum(["7d", "30d"]).default("7d").safeParse(req.query.range ?? undefined);
    if (!range.success) throw new ApiError(422, "invalid_request", "range must be 7d or 30d.");
    const interval = RANGES[range.data];
    const { rows } = await pool.query(
      `SELECT m.id, m.tier, m.position, m.provider, m.model_id, m.status, m.rate_limits, m.rate_limits_seen_at,
              count(c.id)::int AS requests,
              COALESCE(sum(c.tokens_in), 0)::int AS tokens_in, COALESCE(sum(c.tokens_out), 0)::int AS tokens_out,
              count(c.id) FILTER (WHERE c.outcome = 'error')::int AS f_error,
              count(c.id) FILTER (WHERE c.outcome = 'timeout')::int AS f_timeout,
              count(c.id) FILTER (WHERE c.outcome = 'rate_limited')::int AS f_rate_limited,
              count(c.id) FILTER (WHERE c.outcome = 'ok' AND c.tier <> 'fallback' AND EXISTS (
                SELECT 1 FROM model_calls p WHERE p.tenant_id = $1 AND p.request_id = c.request_id AND p.id < c.id))::int AS backup_uses,
              count(c.id) FILTER (WHERE c.outcome = 'ok' AND c.tier = 'fallback')::int AS fallback_uses,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c.latency_ms))::int AS median_latency_ms,
              sum(c.cost_usd)::float8 AS cost_usd
       FROM tenant_models m
       LEFT JOIN model_calls c ON c.tenant_model_id = m.id AND c.tenant_id = m.tenant_id AND c.created_at >= now() - $2::interval
       WHERE m.tenant_id = $1
       GROUP BY m.id
       ORDER BY CASE m.tier WHEN 'cheap' THEN 0 WHEN 'expensive' THEN 1 ELSE 2 END, m.position`, [req.tenantId, interval]);
    const { rows: [{ total }] } = await pool.query(
      "SELECT sum(cost_usd)::float8 AS total FROM model_calls WHERE tenant_id = $1 AND created_at >= now() - $2::interval", [req.tenantId, interval]);
    res.json({
      range: range.data,
      total_cost_usd: total, // estimated provider cost; null when nothing was priced
      models: rows.map(({ f_error, f_timeout, f_rate_limited, ...m }) => ({ ...m, failures: { error: f_error, timeout: f_timeout, rate_limited: f_rate_limited } })),
    });
  });

  r.post("/", async (req, res) => {
    const parsed = addBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError(422, "invalid_request", `Invalid request: ${parsed.error.issues[0].path.join(".") || "body"}.`);
    const m = parsed.data;
    try { await assertEndpoint(m.endpoint_url, { production: config.production, resolve: resolveHost }); }
    catch (e) { if (e instanceof EndpointError) throw new ApiError(422, "invalid_endpoint", e.message); throw e; }
    await testCompletion(m, config, resolveHost); // nothing is saved unless this succeeds

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["models:" + req.tenantId]); // serialise position assignment
      const { rows } = await client.query(
        `INSERT INTO tenant_models (tenant_id, tier, position, provider, model_id, endpoint_url, api_key_encrypted, key_hint, input_price_per_1m, output_price_per_1m)
         VALUES ($1, $2, (SELECT COALESCE(max(position) + 1, 0) FROM tenant_models WHERE tenant_id = $1 AND tier = $2), $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${PUBLIC}`,
        [req.tenantId, m.tier, m.provider, m.model_id, m.endpoint_url, encryptSecret(m.api_key, config.modelKeySecret, req.tenantId), maskKey(m.api_key), m.input_price_per_1m ?? null, m.output_price_per_1m ?? null]);
      await client.query("COMMIT");
      res.status(201).json({ model: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  // Runs fn inside a transaction holding the tenant's models lock (ordering changes must not interleave).
  async function locked<T>(tenantId: string, fn: (q: (sql: string, p: unknown[]) => Promise<{ rows: any[] }>) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["models:" + tenantId]);
      const out = await fn((sql, p) => client.query(sql, p));
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  const notFound = () => new ApiError(404, "not_found", "Model not found.");
  const idOf = (v: string) => { if (!z.uuid().safeParse(v).success) throw notFound(); return v; };

  r.patch("/:id", async (req, res) => {
    const id = idOf(req.params.id);
    const parsed = z.object({ direction: z.enum(["up", "down"]).optional(), input_price_per_1m: price.nullable().optional(), output_price_per_1m: price.nullable().optional() })
      .refine((b) => Object.values(b).some((v) => v !== undefined)).safeParse(req.body);
    if (!parsed.success) throw new ApiError(422, "invalid_request", "Send direction (up or down) and/or input_price_per_1m, output_price_per_1m.");
    const body = parsed.data;
    await locked(req.tenantId, async (q) => {
      const { rows: [me] } = await q("SELECT id, tier, position FROM tenant_models WHERE id = $1 AND tenant_id = $2", [id, req.tenantId]);
      if (!me) throw notFound();
      for (const col of ["input_price_per_1m", "output_price_per_1m"] as const) { // only the prices that were sent; null clears
        if (body[col] !== undefined) await q(`UPDATE tenant_models SET ${col} = $3 WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId, body[col]]);
      }
      if (!body.direction) return;
      const { rows: [other] } = await q(
        `SELECT id, position FROM tenant_models WHERE tenant_id = $1 AND tier = $2 AND position ${body.direction === "up" ? "<" : ">"} $3
         ORDER BY position ${body.direction === "up" ? "DESC" : "ASC"} LIMIT 1`, [req.tenantId, me.tier, me.position]);
      if (!other) return; // already first or last
      // three steps through -1 so UNIQUE (tenant_id, tier, position) holds after every statement
      await q("UPDATE tenant_models SET position = -1 WHERE id = $1 AND tenant_id = $2", [me.id, req.tenantId]);
      await q("UPDATE tenant_models SET position = $3 WHERE id = $1 AND tenant_id = $2", [other.id, req.tenantId, me.position]);
      await q("UPDATE tenant_models SET position = $3 WHERE id = $1 AND tenant_id = $2", [me.id, req.tenantId, other.position]);
    });
    res.json({ models: await grouped(req.tenantId) });
  });

  r.delete("/:id", async (req, res) => {
    const id = idOf(req.params.id);
    await locked(req.tenantId, async (q) => {
      const { rows: [gone] } = await q("DELETE FROM tenant_models WHERE id = $1 AND tenant_id = $2 RETURNING tier, position", [id, req.tenantId]);
      if (!gone) throw notFound();
      // close the gap; go through negative numbers because UNIQUE is checked row by row
      const after = "WHERE tenant_id = $1 AND tier = $2 AND position > $3";
      await q(`UPDATE tenant_models SET position = -position - 1 ${after}`, [req.tenantId, gone.tier, gone.position]);
      await q("UPDATE tenant_models SET position = -position - 2 WHERE tenant_id = $1 AND tier = $2 AND position < 0", [req.tenantId, gone.tier]);
    });
    res.status(204).end();
  });

  return r;
}
