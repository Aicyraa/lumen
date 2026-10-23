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
const PUBLIC = "id, tier, position, provider, model_id, endpoint_url, key_hint, status";

const addBody = z.object({
  provider: z.enum(["openai", "anthropic", "google", "openai_compatible"]),
  model_id: z.string().trim().min(1).max(200),
  endpoint_url: z.string().trim().min(1).max(2048),
  api_key: z.string().trim().min(8).max(1000), // min 8 so the masked hint can never reveal the whole key
  tier: z.enum(TIERS),
}); // unknown fields (such as tenant_id) are ignored: the tenant is always req.tenantId

// Dashboard Models tab. Every statement filters by tenant_id; another tenant's id is a 404.
export function modelsRouter({ pool, config }: Deps) {
  const r = Router();

  async function grouped(tenantId: string) {
    const { rows } = await pool.query(`SELECT ${PUBLIC} FROM tenant_models WHERE tenant_id = $1 ORDER BY tier, position`, [tenantId]);
    return Object.fromEntries(TIERS.map((t) => [t, rows.filter((m) => m.tier === t)]));
  }

  r.get("/", async (req, res) => {
    res.json({ models: await grouped(req.tenantId) });
  });

  r.post("/", async (req, res) => {
    const parsed = addBody.safeParse(req.body);
    if (!parsed.success) throw new ApiError(422, "invalid_request", `Invalid request: ${parsed.error.issues[0].path.join(".") || "body"}.`);
    const m = parsed.data;
    try { await assertEndpoint(m.endpoint_url, { production: config.production }); }
    catch (e) { if (e instanceof EndpointError) throw new ApiError(422, "invalid_endpoint", e.message); throw e; }
    await testCompletion(m, config); // nothing is saved unless this succeeds

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["models:" + req.tenantId]); // serialise position assignment
      const { rows } = await client.query(
        `INSERT INTO tenant_models (tenant_id, tier, position, provider, model_id, endpoint_url, api_key_encrypted, key_hint)
         VALUES ($1, $2, (SELECT COALESCE(max(position) + 1, 0) FROM tenant_models WHERE tenant_id = $1 AND tier = $2), $3, $4, $5, $6, $7)
         RETURNING ${PUBLIC}`,
        [req.tenantId, m.tier, m.provider, m.model_id, m.endpoint_url, encryptSecret(m.api_key, config.modelKeySecret, req.tenantId), maskKey(m.api_key)]);
      await client.query("COMMIT");
      res.status(201).json({ model: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  return r;
}
