# Lumen database design

The authoritative schema is the numbered SQL in `infra/sql/` (applied with `pnpm db:migrate`, each file once, recorded in `schema_migrations`). This page records the design and the reasons. Better Auth owns its own tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey`); we never edit them by hand.

## Tenancy

`tenants (id TEXT PRIMARY KEY, created_at)` is the registry of tenants. `tenants.id` equals the Better Auth organization id. It is our own table, so the Python service and its tests do not need the Better Auth tables. Every table that holds tenant data has `tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, and every statement that reads or writes them still filters on `tenant_id` (rule 1). Deleting a project is therefore `DELETE FROM tenants WHERE id = $1` plus deleting the organization, in one transaction. The API inserts the `tenants` row when an organization is created (`ON CONFLICT DO NOTHING`).

## Tables (third normal form)

| Table | Holds | Key |
| --- | --- | --- |
| `tenants` | one row per project | `id` |
| `documents` | uploaded files: filename, status, error, created_at | `id` UUID, `UNIQUE (id, tenant_id)` |
| `chunks` | passage text and vector | `id` BIGINT identity; `(document_id, tenant_id)` FK to documents, cascade |
| `request_logs` | one row per chat request: query, route fields, request latency, status, feedback, created_at | `id` UUID |
| `request_sources` | the sources of a request, one row each: position, document_id, chunk_id, score | `(request_id, position)` |
| `tenant_models` | a tenant's models: tier, position, provider, model_id, endpoint, encrypted key, key_hint, prices, status, last seen rate limits | `id` UUID, `UNIQUE (tenant_id, tier, position)` |
| `model_calls` | one row per model attempt: outcome, tokens, latency, cost, snapshots of provider and model id | `id` BIGINT identity |

Views (derived values are computed, not stored): `document_stats` (document_id, tenant_id, chunk_count) and `request_usage` (request_id, tenant_id, tokens_in, tokens_out, cost_usd, summed from `model_calls`). The columns `documents.chunk_count`, `request_logs.tokens_in`, `tokens_out`, `cost_usd` and `request_logs.sources` (JSON) are removed.

## Decisions

- `chunks.tenant_id` stays although it is derivable from the document: the composite foreign key makes a cross-tenant chunk impossible and every search filters on it. Deliberate, for isolation.
- `model_calls.provider` and `model_id` stay as snapshots so history survives deleting a model; `model_calls.tenant_model_id` is a foreign key with `ON DELETE SET NULL`.
- `request_sources.document_id` and `chunk_id` are nullable foreign keys with `ON DELETE SET NULL`, so a deleted or re-ingested document shows as "deleted document" instead of losing the row.
- `request_logs.api_key_id` is a plain reference to the Better Auth `apikey` table with no foreign key, so our schema does not depend on Better Auth's table order or names.
- Small closed sets (tier, provider, status, outcome, rating) stay as `CHECK` constraints; lookup tables would add joins with no integrity gain.
- `tenant_models.rate_limits` (JSON, last seen provider headers) stays as one attribute: it is a snapshot, not a relation.
- Row Level Security is enabled on every application table with no policies, and access for `anon` and `authenticated` is revoked when those roles exist (Supabase). The services connect directly with a privileged role and never through the Supabase Data API.
- Indexes cover every foreign key and the dashboard queries (`model_calls (request_id)`, `model_calls (tenant_model_id)`, `request_sources (tenant_id, document_id)`, plus the existing tenant and time indexes).

## Environments

- Local development and tests: Podman or Docker Postgres 16 with pgvector (`pnpm db:up`), databases `lumen`, `lumen_test`, `lumen_rag_test`.
- Supabase project `lumen` (Postgres 17): migrations are applied with the Supabase migration tool, then `get_advisors` (security and performance) is run and findings fixed. The Free plan has no branching, so by the human's decision (2026-10-24) the normalized schema is applied directly to this project, which had no tables or data.
