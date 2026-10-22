# Lumen

Multi-tenant RAG gateway. See `AI_BUILD_BRIEF.md` for the full brief.

## Database (Phase 0)

```bash
cp .env.example .env            # then set POSTGRES_PASSWORD in .env
docker compose up -d db         # start Postgres 16 with pgvector
docker compose exec -T db psql -U postgres -d lumen < infra/sql/001_app_tables.sql
docker compose exec db psql -U postgres -d lumen -c '\dx'   # lists "vector"
docker compose exec db psql -U postgres -d lumen -c '\dt'   # documents, chunks, request_logs
```

Host port is 5433 (5432 is often taken by a system Postgres); use `DATABASE_URL=postgresql://postgres:<password>@localhost:5433/lumen`.
Without a compose provider (Podman), see `podman run` equivalent in NOTES.md.

Stop with `docker compose down` (add `-v` to also delete the data volume).

## RAG core tests (Phase 1)

```bash
podman exec lumen-db psql -U postgres -c 'CREATE DATABASE lumen_test'   # once
cd rag-service && python -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/pytest
```
