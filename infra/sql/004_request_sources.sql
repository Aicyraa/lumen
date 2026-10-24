-- Phase DB: the sources of a request, one row each, replacing request_logs.sources (JSONB). Safe to run twice.
-- A deleted or re-ingested document or chunk leaves the row with a NULL id ("deleted document") instead of losing it.

-- target for request_sources' composite FK
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_logs_id_tenant_key') THEN
    ALTER TABLE request_logs ADD CONSTRAINT request_logs_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS request_sources (
  request_id  UUID    NOT NULL,
  tenant_id   TEXT    NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,                -- 0 = first source returned
  document_id UUID,
  chunk_id    BIGINT  REFERENCES chunks (id) ON DELETE SET NULL,
  score       REAL,
  PRIMARY KEY (request_id, position),
  -- a source can only belong to a request and a document of the same tenant
  FOREIGN KEY (request_id, tenant_id) REFERENCES request_logs (id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (document_id, tenant_id) REFERENCES documents (id, tenant_id) ON DELETE SET NULL (document_id)
);

-- Move the JSON, then drop it. Ids that no longer exist in the same tenant become NULL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'request_logs' AND column_name = 'sources') THEN
    INSERT INTO request_sources (request_id, tenant_id, position, document_id, chunk_id, score)
    SELECT r.id, r.tenant_id, (e.ord - 1)::int, d.id, c.id,
           CASE WHEN jsonb_typeof(e.v -> 'score') = 'number' THEN (e.v ->> 'score')::real END
    FROM request_logs r
    CROSS JOIN LATERAL jsonb_array_elements(r.sources) WITH ORDINALITY AS e(v, ord)
    LEFT JOIN documents d ON d.tenant_id = r.tenant_id AND d.id::text = e.v ->> 'document_id'
    LEFT JOIN chunks c    ON c.tenant_id = r.tenant_id AND c.id::text = e.v ->> 'chunk_id'
    WHERE jsonb_typeof(r.sources) = 'array'
    ON CONFLICT DO NOTHING;
    ALTER TABLE request_logs DROP COLUMN sources;
  END IF;
END $$;
