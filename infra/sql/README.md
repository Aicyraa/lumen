# infra/sql

The database schema as numbered SQL migrations for Postgres 16+ with the `vector` (pgvector) extension. The design and the reasons are in [docs/DATABASE.md](../../docs/DATABASE.md).

| File | What it adds |
| --- | --- |
| `001_app_tables.sql` | The `vector` extension and the first tables: `documents`, `chunks`, `request_logs` |
| `002_tenant_models.sql` | `tenant_models` and `model_calls`: a tenant's own models and one row per model attempt |
| `003_tenants.sql` | The `tenants` registry; every tenant table points at it with `ON DELETE CASCADE` |
| `004_request_sources.sql` | `request_sources`, replacing the JSON sources column of `request_logs` |
| `005_views.sql` | The derived views `document_stats` and `request_usage` |
| `006_indexes_rls.sql` | Foreign-key and dashboard indexes, and row level security on every application table |
| `007_default_privileges.sql` | Takes away default Data API privileges on sequences and later objects (Supabase) |
| `008_chunk_tenant_fk.sql` | Composite foreign key so a source cannot point at another tenant's chunk |
| `009_fk_indexes.sql` | Indexes that follow the composite foreign keys' column order |
| `010_remove_fallback_tier.sql` | Removes the fallback model tier |
| `011_chunks_tsvector.sql` | A stored `tsvector` column with a GIN index on `chunks`, for BM25 |
| `auth/001_auth_tables_rls.sql` | Row level security on Better Auth's tables. Not numbered with the others: it must run after Better Auth has created its tables (`pnpm --filter @lumen/api auth:migrate` does it) |

## Applying them

- Files run in numeric order, each once. `pnpm db:migrate` (repo root) applies the pending files to the local development database and records each in the `schema_migrations` table; `pnpm db:status` lists applied and pending files. Tests apply every file to their own test database.
- Do not run these files twice by hand against a database that already has them. Most are written to be re-runnable, but `001` is not, and a hand-run file is not recorded in `schema_migrations`, so the tracker would later try to apply it again.
- Migrations are forward-only: there are no down scripts. A file that has been applied is never edited; a change is a new file with the next number.
- A database that was migrated by another tool (for example the Supabase migration tool, which does not write `schema_migrations`) must not be migrated with `pnpm db:migrate`. Apply new files there with that tool.
