-- Supabase performance advisor (unindexed_foreign_keys): indexes whose leading columns follow each composite foreign key's
-- column order, so the cascade and SET NULL lookups use them. Safe to run twice.
CREATE INDEX IF NOT EXISTS chunks_document_tenant_idx ON chunks (document_id, tenant_id);
CREATE INDEX IF NOT EXISTS request_sources_request_tenant_idx ON request_sources (request_id, tenant_id);
CREATE INDEX IF NOT EXISTS request_sources_document_tenant_idx ON request_sources (document_id, tenant_id);
CREATE INDEX IF NOT EXISTS request_sources_chunk_tenant_idx ON request_sources (chunk_id, tenant_id);
-- superseded by request_sources_chunk_tenant_idx
DROP INDEX IF EXISTS request_sources_chunk_idx;
