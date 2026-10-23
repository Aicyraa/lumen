-- Phase 3B: tenants' own models and per-attempt model usage. Safe to run twice.

CREATE TABLE IF NOT EXISTS tenant_models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  tier              TEXT NOT NULL CHECK (tier IN ('cheap', 'expensive', 'fallback')),
  position          INTEGER NOT NULL,         -- 0 = PRIMARY, 1 = BACKUP 1, ...; tried top to bottom
  provider          TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'openai_compatible')),
  model_id          TEXT NOT NULL,
  endpoint_url      TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,            -- AES-256-GCM, never returned
  key_hint          TEXT NOT NULL,            -- masked display such as 'sk-...a1b2'
  status            TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'failing')),
  rate_limits       JSONB,                    -- provider-reported limits from response headers (e.g. x-ratelimit-limit-requests, remaining-tokens, reset); NULL when the provider reports none
  rate_limits_seen_at TIMESTAMPTZ,
  input_price_per_1m  NUMERIC(12, 6),       -- tenant-entered, optional; their provider's price per 1M input tokens
  output_price_per_1m NUMERIC(12, 6),       -- same for output tokens; NULL means no cost is estimated for this model
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tier, position)
);
CREATE INDEX IF NOT EXISTS tenant_models_tenant_idx ON tenant_models (tenant_id, tier, position);

-- One row per model attempt (a request that falls back writes several), for per-model usage and analytics.
CREATE TABLE IF NOT EXISTS model_calls (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  request_id      UUID NOT NULL,              -- request_logs.id
  tenant_model_id UUID,                       -- NULL for the dev/test default model or a since-deleted model
  provider        TEXT NOT NULL,              -- snapshot, survives deleting the model
  model_id        TEXT NOT NULL,              -- snapshot
  tier            TEXT NOT NULL CHECK (tier IN ('cheap', 'expensive', 'fallback', 'default')),
  outcome         TEXT NOT NULL CHECK (outcome IN ('ok', 'error', 'timeout', 'rate_limited')),
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  latency_ms      INTEGER,
  cost_usd        NUMERIC(12, 6),             -- tenant's estimated provider cost for this attempt; NULL when unpriced
  cost_source     TEXT CHECK (cost_source IN ('estimated', 'provider')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_calls_tenant_time_idx ON model_calls (tenant_id, created_at DESC);

-- Databases created before the price columns existed.
ALTER TABLE tenant_models ADD COLUMN IF NOT EXISTS input_price_per_1m NUMERIC(12, 6);
ALTER TABLE tenant_models ADD COLUMN IF NOT EXISTS output_price_per_1m NUMERIC(12, 6);
ALTER TABLE model_calls ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 6);
ALTER TABLE model_calls ADD COLUMN IF NOT EXISTS cost_source TEXT CHECK (cost_source IN ('estimated', 'provider'));
