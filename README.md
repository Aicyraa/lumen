# Lumen

Multi-tenant RAG gateway. See `docs/AI_BUILD_BRIEF.md` for the full brief.

## Database (Phase 0)

```bash
cp .env.example .env            # then set POSTGRES_PASSWORD in .env
docker compose up -d db         # start Postgres 16 with pgvector
docker compose exec -T db psql -U postgres -d lumen < infra/sql/001_app_tables.sql
docker compose exec db psql -U postgres -d lumen -c '\dx'   # lists "vector"
docker compose exec db psql -U postgres -d lumen -c '\dt'   # documents, chunks, request_logs
```

Host port is 5433 (5432 is often taken by a system Postgres); use `DATABASE_URL=postgresql://postgres:<password>@localhost:5433/lumen`.
Without a compose provider (Podman), see `podman run` equivalent in docs/NOTES.md.

Stop with `docker compose down` (add `-v` to also delete the data volume).

## RAG core tests (Phase 1)

```bash
podman exec lumen-db psql -U postgres -c 'CREATE DATABASE lumen_test'   # once
pnpm bootstrap && pnpm test
```

## Monorepo (Turborepo + pnpm)

```text
apps/api  apps/web  apps/rag-service   # applications
tools/eval  infra/sql  docs            # scripts, SQL, briefs
```

```bash
pnpm install        # root tooling (turbo)
pnpm bootstrap      # rag-service: create .venv and install requirements
pnpm test           # every app's tests via turbo
pnpm dev            # every app's dev server
```

## Dashboard (apps/web)

`pnpm --filter @lumen/web dev` serves the dashboard at http://localhost:5173 (or run everything with `pnpm dev`). It talks to the API at `VITE_API_URL`.

Vite reads environment variables only from `apps/web/` (`apps/web/.env`), not from the repo-root `.env`, and only the ones that start with `VITE_` reach the browser. In development `VITE_API_URL` defaults to `http://localhost:3000`, so `cp apps/web/.env.example apps/web/.env` is optional; do it when the API runs elsewhere. A production build has no default: `vite build` output with `VITE_API_URL` unset shows a "Missing VITE_API_URL" screen instead of the app. The API's `DASHBOARD_ORIGIN` must be the dashboard's origin for sign-in cookies and CORS to work.
