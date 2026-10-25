-- Phase DB: derived values are computed, not stored. Safe to run twice.
-- security_invoker: the views run with the caller's rights, so they never bypass row level security (Supabase advisor).

CREATE OR REPLACE VIEW document_stats WITH (security_invoker = true) AS
SELECT d.id AS document_id, d.tenant_id, count(c.id)::int AS chunk_count
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id AND c.tenant_id = d.tenant_id
GROUP BY d.id, d.tenant_id;

-- Tokens and the tenant's estimated provider cost of a request: the sum over its model attempts (NULL when none was priced).
CREATE OR REPLACE VIEW request_usage WITH (security_invoker = true) AS
SELECT r.id AS request_id, r.tenant_id,
       sum(m.tokens_in)::int AS tokens_in, sum(m.tokens_out)::int AS tokens_out, sum(m.cost_usd) AS cost_usd
FROM request_logs r
LEFT JOIN model_calls m ON m.request_id = r.id AND m.tenant_id = r.tenant_id
GROUP BY r.id, r.tenant_id;

ALTER TABLE documents    DROP COLUMN IF EXISTS chunk_count;
ALTER TABLE request_logs DROP COLUMN IF EXISTS tokens_in;
ALTER TABLE request_logs DROP COLUMN IF EXISTS tokens_out;
ALTER TABLE request_logs DROP COLUMN IF EXISTS cost_usd;
