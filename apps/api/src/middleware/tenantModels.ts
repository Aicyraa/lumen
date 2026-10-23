import type { RequestHandler } from "express";
import { decryptSecret } from "../lib/crypto.js";
import { ApiError } from "../lib/errors.js";
import type { KnownModel } from "../services/modelCalls.js";
import type { ModelsPayload } from "../services/rag.js";
import type { Deps } from "../types/types.js";
import "../types/types.js";

export interface TenantModels { payload: ModelsPayload; known: Map<string, KnownModel> }

// Loads the tenant's models and decrypts their keys for this one request (rule 11). The keys live only on req.
// No models: production answers 422 here, before any service call; elsewhere req.tenantModels stays unset so
// the Python service uses its env default.
export const loadTenantModels = ({ pool, config }: Pick<Deps, "pool" | "config">): RequestHandler => async (req, _res, next) => {
  const { rows } = await pool.query(
    `SELECT id, tier, provider, model_id, endpoint_url, api_key_encrypted, input_price_per_1m, output_price_per_1m
     FROM tenant_models WHERE tenant_id = $1 ORDER BY tier, position`, [req.tenantId]);
  if (!rows.length) {
    if (config.production) throw new ApiError(422, "no_models_configured", "No models are configured. Add a model in the Models tab.");
    return next();
  }
  const payload: ModelsPayload = { cheap: [], expensive: [], fallback: [] };
  const known = new Map<string, KnownModel>();
  for (const r of rows) {
    let api_key: string;
    try { api_key = decryptSecret(r.api_key_encrypted, config.modelKeySecret, req.tenantId); }
    catch { throw new ApiError(500, "internal_error", "A stored model key could not be read. Remove and re-add that model."); }
    payload[r.tier as keyof ModelsPayload].push({ provider: r.provider, model_id: r.model_id, endpoint_url: r.endpoint_url, api_key, tenant_model_id: r.id });
    known.set(r.id, {
      provider: r.provider, model_id: r.model_id, tier: r.tier,
      inputPrice: r.input_price_per_1m == null ? null : Number(r.input_price_per_1m),
      outputPrice: r.output_price_per_1m == null ? null : Number(r.output_price_per_1m),
    });
  }
  req.tenantModels = { payload, known };
  next();
};
