# Lumen database design

The authoritative schema is the numbered SQL in `infra/sql/` (applied with `pnpm db:migrate`, each file once, recorded in `schema_migrations`). This page records the design and the reasons. Better Auth owns its own tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey`); we never edit them by hand.

## Tenancy

`tenants (id TEXT PRIMARY KEY, created_at)` is the registry of tenants. `tenants.id` equals the Better Auth organization id. It is our own table, so the Python service and its tests do not need the Better Auth tables. Every table that holds tenant data has `tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, and every statement that reads or writes them still filters on `tenant_id` (rule 1). Deleting a project is therefore `DELETE FROM tenants WHERE id = $1` plus deleting the organization, in one transaction. The API inserts the `tenants` row when an organization is created (`ON CONFLICT DO NOTHING`).

## Tables (third normal form)

| Table | Holds | Key |
| --- | --- | --- |
| `tenants` | one row per project | `id` |
| `documents` | uploaded files: filename, status, error, created_at | `id` UUID, `UNIQUE (id, tenant_id)` |
| `chunks` | passage text and vector | `id` BIGSERIAL (a sequence, not an identity column), `UNIQUE (id, tenant_id)`; `(document_id, tenant_id)` FK to documents, cascade |
| `request_logs` | one row per chat request: query, route fields, request latency, status, feedback, created_at | `id` UUID |
| `request_sources` | the sources of a request, one row each: position, document_id, chunk_id, score | `(request_id, position)` |
| `tenant_models` | a tenant's models: tier, position, provider, model_id, endpoint, encrypted key, key_hint, prices, status, last seen rate limits | `id` UUID, `UNIQUE (tenant_id, tier, position)` |
| `model_calls` | one row per model attempt: outcome, tokens, latency, cost, snapshots of provider and model id | `id` BIGSERIAL |

Views (derived values are computed, not stored): `document_stats` (document_id, tenant_id, chunk_count; every document, 0 when it has no chunks) and `request_usage` (request_id, tenant_id, tokens_in, tokens_out, cost_usd, summed from `model_calls`; NULL when the request has no attempt or none was priced). Both are `security_invoker` views, so they never bypass row level security, and both join on `tenant_id` as well as the id. A request's tokens are now the sum over all its attempts (a failed attempt usually reports none), not the last response's usage. The columns `documents.chunk_count`, `request_logs.tokens_in`, `tokens_out`, `cost_usd` and `request_logs.sources` (JSON) are removed.

## Decisions

- `request_sources.chunk_id` is composite too (migration 008): `(chunk_id, tenant_id)` references `chunks (id, tenant_id)` with `ON DELETE SET NULL (chunk_id)`, so a source can never point at another tenant's chunk. This replaces the single-column foreign key 004 created.
- Upgrading from the old schema loses history that was only stored on `request_logs`. Migration 005 drops `request_logs.tokens_in`, `tokens_out` and `cost_usd` and migrates nothing: a request's tokens and cost are now the sum of its `model_calls` rows. Requests with no `model_calls` rows (every request logged before Phase 3B created that table, and requests whose attempts could not be written) show NULL tokens and cost afterwards; their old totals are not carried over. Take a backup first if that history matters.
- Migration 004 reads `request_logs.sources` once and keeps an id only if the document (and chunk) exists in the same tenant; anything else becomes NULL. It runs in one statement over the whole table, so on a very large table run it in a quiet period. It is not edited after being applied.
- A failed `tenants` insert in the organization-created hook fails the create call (the API answers 500) and releases the per-user create lock, but the organization row already exists without a `tenants` row. Writes for it then fail the foreign key (documents) or write nothing (chat). Known gap: the fix is to insert the row for such an organization by hand (`INSERT INTO tenants (id) VALUES (...)`).

- `chunks.tenant_id` stays although it is derivable from the document: the composite foreign key makes a cross-tenant chunk impossible and every search filters on it. Deliberate, for isolation.
- `model_calls.provider` and `model_id` stay as snapshots so history survives deleting a model; `model_calls.tenant_model_id` is a foreign key with `ON DELETE SET NULL`. As with documents it is composite, `(tenant_model_id, tenant_id)` to `tenant_models (id, tenant_id)` with `ON DELETE SET NULL (tenant_model_id)`, so a call can only name a model of its own tenant (this needs `UNIQUE (id, tenant_id)` on `tenant_models`). Migration 003 first sets the id to NULL on calls whose model no longer exists.
- Migration 010 removes the fallback tier: it deletes every `tenant_models` row with `tier = 'fallback'` (their encrypted provider keys go with them, intended) and narrows `tenant_models.tier` to `('cheap', 'expensive')`. `model_calls.tier` keeps `('cheap', 'expensive', 'fallback', 'default')` on purpose so historical rows stay valid; nothing writes `'fallback'` any more (the API stores a stray one from an old rag-service as `'default'`). Not yet applied to the Supabase project.
- `model_calls.request_id` has no foreign key to `request_logs`: the chat route writes the attempts even when the request row could not be written, and the row is kept as bookkeeping. It is indexed because `request_usage` joins on it.
- `request_sources.document_id` and `chunk_id` are nullable foreign keys with `ON DELETE SET NULL`, so a deleted or re-ingested document shows as "deleted document" instead of losing the row. `(document_id, tenant_id)` references `documents (id, tenant_id)` with `ON DELETE SET NULL (document_id)` (PostgreSQL 15 or later, so `tenant_id` is never nulled), and `(request_id, tenant_id)` references `request_logs (id, tenant_id)` (which therefore has `UNIQUE (id, tenant_id)`) with `ON DELETE CASCADE`: a source can never belong to another tenant's request or document. The primary key is `(request_id, position)`, position counting from 0. Migration 004 moves the old JSON; ids that no longer exist in the same tenant become NULL.
- `request_logs.api_key_id` is a plain reference to the Better Auth `apikey` table with no foreign key, so our schema does not depend on Better Auth's table order or names.
- Small closed sets (tier, provider, status, outcome, rating) stay as `CHECK` constraints; lookup tables would add joins with no integrity gain.
- `tenant_models.rate_limits` (JSON, last seen provider headers) stays as one attribute: it is a snapshot, not a relation.
- Migration 003 backfills `tenants` from every tenant id found in the six tables and, when Better Auth's `organization` table exists, from every organization. Files 003 to 006 are re-runnable (`IF NOT EXISTS`, guarded `DO` blocks), because the API test setup applies them to `lumen_test` on every run.
- Better Auth's tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey`) get the same treatment from `infra/sql/auth/001_auth_tables_rls.sql`. It lives outside the numbered folder because it must run after Better Auth has created its tables: `pnpm --filter @lumen/api auth:migrate` runs it right after Better Auth's migrations, and on Supabase it is applied through the migration tool after Better Auth's tables exist. It is guarded (only tables and roles that exist) and re-runnable. Migration 007 revokes the default privileges Supabase grants to `anon` and `authenticated` on new tables, sequences and functions and the privileges on existing sequences (schema `USAGE` is kept). The services connect as the table owner (`postgres`), which bypasses RLS; a role without `BYPASSRLS` that is not the owner would see no rows.
- Row Level Security is enabled on every application table (and on `schema_migrations`) with no policies, and access for `anon` and `authenticated` is revoked when those roles exist (Supabase). The services connect directly with a privileged role and never through the Supabase Data API.
- Indexes cover every foreign key and the dashboard queries: `model_calls (request_id)`, `model_calls (tenant_model_id, tenant_id)` (partial, not null), `request_sources (tenant_id, document_id)`, `request_sources (chunk_id)` (partial, not null), plus the existing tenant and time indexes from 001 and 002 (all of them lead with `tenant_id`, which covers the `tenants` foreign keys). `CREATE INDEX CONCURRENTLY` is not used because the migration tool wraps each file in a transaction.

## Environments

- Local development and tests: Podman or Docker Postgres 16 with pgvector (`pnpm db:up`), databases `lumen`, `lumen_test`, `lumen_rag_test`.
- Supabase project `lumen` (Postgres 17): migrations are applied with the Supabase migration tool, then `get_advisors` (security and performance) is run and findings fixed. The Free plan has no branching, so by the human's decision (2026-10-24) the normalized schema is applied directly to this project, which had no tables or data.

## Supabase status (applied 2026-10-24)

Applied to the main project `lumen` (Postgres 17, was empty) through the Supabase migration tool, in this order: `better_auth_tables`, `better_auth_tables_rls`, `app_001` to `app_009` (the repo's `infra/sql/001` to `009`). Verified afterwards: every public table has RLS enabled and neither `anon` nor `authenticated` can SELECT any table or view. Advisors: security shows 15 INFO `rls_enabled_no_policy` (intentional: deny-all, the services connect as the owner role) and one WARN `extension_in_public` for `vector` (accepted: moving it risks the services not finding the vector type); performance shows the unused-index INFOs (no traffic yet) and one INFO for Better Auth's own `invitation.inviterId` foreign key. The migration history on Supabase lists 005 and 007 before 004, 006 and 008 because three calls were sent together by mistake and had to be re-applied in order; the resulting schema is the same.

Connect the services with the session pooler (port 5432) or the direct connection, not the transaction pooler (6543): psycopg auto-prepares statements. The direct host is IPv6-only unless the IPv4 add-on is enabled.
