# Commands

- Dev DB (no `docker compose`): `podman run -d --name lumen-db -p 5433:5432 -e POSTGRES_PASSWORD=... -e POSTGRES_DB=lumen -v lumen_db_data:/var/lib/postgresql/data docker.io/pgvector/pgvector:pg16`
- Apply schema: `podman exec -i lumen-db psql -U postgres -d lumen < infra/sql/001_app_tables.sql`
- rag-service tests: `cd rag-service && pytest` (use a separate test DB/schema, never dev data).
- Graph refresh after code changes: `graphify update .`
