-- Phase DB review fix: a source can never point at another tenant's chunk, same as documents. Safe to run twice.
DO $$
DECLARE fk text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chunks_id_tenant_key') THEN
    ALTER TABLE chunks ADD CONSTRAINT chunks_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
  -- the single-column foreign key from 004, by its real name
  FOR fk IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'request_sources'::regclass AND contype = 'f' AND confrelid = 'chunks'::regclass
              AND conname <> 'request_sources_chunk_tenant_fk' LOOP
    EXECUTE format('ALTER TABLE request_sources DROP CONSTRAINT %I', fk);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_sources_chunk_tenant_fk') THEN
    -- 004 stored a chunk only when it belonged to the same tenant, so existing rows satisfy this
    ALTER TABLE request_sources ADD CONSTRAINT request_sources_chunk_tenant_fk
      FOREIGN KEY (chunk_id, tenant_id) REFERENCES chunks (id, tenant_id) ON DELETE SET NULL (chunk_id);
  END IF;
END $$;
