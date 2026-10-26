-- BM25 no longer recomputes to_tsvector('english', content) for every chunk of the tenant on every query:
-- chunks keep a stored, generated tsvector with a GIN index. Safe to run twice; the migration tool runs it in
-- one transaction. Adding a stored generated column rewrites the table once (a lock on chunks while it runs).
-- Row level security is unchanged (enabled with no policies, see 006), and every query still filters tenant_id.
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);
