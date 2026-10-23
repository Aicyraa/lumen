# Commands

- Dev DB (no `docker compose`): `podman run -d --name lumen-db -p 5433:5432 -e POSTGRES_PASSWORD=... -e POSTGRES_DB=lumen -v lumen_db_data:/var/lib/postgresql/data docker.io/pgvector/pgvector:pg16`
- Apply schema: `podman exec -i lumen-db psql -U postgres -d lumen < infra/sql/001_app_tables.sql`
- Root (Turborepo + pnpm): `pnpm bootstrap` (rag-service venv), `pnpm test`, `pnpm dev`. rag-service tests alone: `cd apps/rag-service && .venv/bin/pytest` (separate test DB, never dev data).
- Never `pkill -f` in the shell; kill by PID from `ss -ltnp`. `pnpm setup` is a pnpm builtin; the script is named `bootstrap`.
- Graph refresh after code changes: `graphify update .`
