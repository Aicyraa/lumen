CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,                  -- Better Auth organization id
  filename    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error       TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_tenant_idx ON documents (tenant_id);
ALTER TABLE documents ADD CONSTRAINT documents_id_tenant_key UNIQUE (id, tenant_id); -- target for chunks' composite FK

CREATE TABLE chunks (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  document_id UUID NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(384) NOT NULL,           -- all-MiniLM-L6-v2 output size
  -- a chunk can only point to a document of the same tenant
  FOREIGN KEY (document_id, tenant_id) REFERENCES documents (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX chunks_tenant_doc_idx ON chunks (tenant_id, document_id);

CREATE TABLE request_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  api_key_id  TEXT,
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  query       TEXT NOT NULL,
  sources     JSONB NOT NULL DEFAULT '[]',    -- [{document_id, chunk_id, score}] from the chat response; for the Requests detail view
  model_tier  TEXT,                           -- 'cheap', 'expensive' or 'none'
  k           INTEGER,
  escalated   BOOLEAN,
  difficulty  REAL,
  top_score   REAL,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  cost_usd    NUMERIC(12, 6),                 -- stays NULL until Phase 7
  latency_ms  INTEGER,
  status      TEXT NOT NULL DEFAULT 'ok',
  feedback    SMALLINT CHECK (feedback IN (-1, 1))
);
CREATE INDEX request_logs_tenant_time_idx ON request_logs (tenant_id, created_at DESC);
