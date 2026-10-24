-- Phase DB: an index on every foreign key that lacked one, the dashboard query indexes, and row level security.
-- Safe to run twice. (Plain CREATE INDEX: the migration runs inside a transaction.)

-- model_calls: the request_usage join and "earlier attempt of the same request"; ON DELETE SET NULL of a model.
CREATE INDEX IF NOT EXISTS model_calls_request_idx ON model_calls (request_id);
CREATE INDEX IF NOT EXISTS model_calls_tenant_model_idx ON model_calls (tenant_model_id, tenant_id) WHERE tenant_model_id IS NOT NULL;
-- request_sources: tenant_id, document_id for the composite FK and per-document lookups; chunk_id for the SET NULL on chunk delete.
CREATE INDEX IF NOT EXISTS request_sources_tenant_doc_idx ON request_sources (tenant_id, document_id);
CREATE INDEX IF NOT EXISTS request_sources_chunk_idx ON request_sources (chunk_id) WHERE chunk_id IS NOT NULL;
-- Already indexed by 001 and 002 (leading column tenant_id): documents_tenant_idx, chunks_tenant_doc_idx,
-- request_logs_tenant_time_idx, tenant_models_tenant_idx, model_calls_tenant_time_idx.

-- Row level security with no policies: the Supabase Data API roles see nothing. The services connect with a privileged role.
ALTER TABLE tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_models   ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_calls     ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
  END IF;
  -- Only on Supabase: the roles do not exist on a plain Postgres.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON tenants, documents, chunks, request_logs, request_sources, tenant_models, model_calls, document_stats, request_usage FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON tenants, documents, chunks, request_logs, request_sources, tenant_models, model_calls, document_stats, request_usage FROM authenticated;
  END IF;
END $$;
