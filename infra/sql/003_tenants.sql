-- Phase DB: the tenants registry. tenants.id is the Better Auth organization id; every tenant table points at it,
-- so deleting a tenant removes all of its data. Safe to run twice.

CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill before the foreign keys: every tenant id already in use, and every organization when Better Auth's table exists.
INSERT INTO tenants (id)
SELECT tenant_id FROM documents
UNION SELECT tenant_id FROM chunks
UNION SELECT tenant_id FROM request_logs
UNION SELECT tenant_id FROM tenant_models
UNION SELECT tenant_id FROM model_calls
ON CONFLICT DO NOTHING;
DO $$
BEGIN
  IF to_regclass('public.organization') IS NOT NULL THEN
    INSERT INTO tenants (id) SELECT id FROM organization ON CONFLICT DO NOTHING;
  END IF;
END $$;

ALTER TABLE documents     DROP CONSTRAINT IF EXISTS documents_tenant_fk;
ALTER TABLE documents     ADD CONSTRAINT documents_tenant_fk     FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE chunks        DROP CONSTRAINT IF EXISTS chunks_tenant_fk;
ALTER TABLE chunks        ADD CONSTRAINT chunks_tenant_fk        FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE request_logs  DROP CONSTRAINT IF EXISTS request_logs_tenant_fk;
ALTER TABLE request_logs  ADD CONSTRAINT request_logs_tenant_fk  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE tenant_models DROP CONSTRAINT IF EXISTS tenant_models_tenant_fk;
ALTER TABLE tenant_models ADD CONSTRAINT tenant_models_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
ALTER TABLE model_calls   DROP CONSTRAINT IF EXISTS model_calls_tenant_fk;
ALTER TABLE model_calls   ADD CONSTRAINT model_calls_tenant_fk   FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;

-- model_calls.tenant_model_id becomes a real reference (history survives deleting a model: SET NULL, same tenant only).
-- Calls that name a model that no longer exists are detached first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_models_id_tenant_key') THEN
    ALTER TABLE tenant_models ADD CONSTRAINT tenant_models_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
END $$;
UPDATE model_calls c SET tenant_model_id = NULL
WHERE tenant_model_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenant_models m WHERE m.id = c.tenant_model_id AND m.tenant_id = c.tenant_id);
ALTER TABLE model_calls DROP CONSTRAINT IF EXISTS model_calls_tenant_model_fk;
ALTER TABLE model_calls ADD CONSTRAINT model_calls_tenant_model_fk
  FOREIGN KEY (tenant_model_id, tenant_id) REFERENCES tenant_models (id, tenant_id) ON DELETE SET NULL (tenant_model_id);
