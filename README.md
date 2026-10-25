# Lumen

Multi-tenant RAG gateway: upload documents, get an API key, call one chat endpoint. Each project is an isolated tenant. See `docs/AI_BUILD_BRIEF.md` for the full brief.

## Layout

```text
apps/api            Express + Better Auth (TypeScript), grouped by feature in src/modules
apps/web            React + Vite dashboard and public site, grouped by feature in src/features
apps/rag-service    FastAPI RAG service (Python): api, core, ingest, retrieval, llm
infra/sql           Numbered SQL migrations (applied with pnpm db:migrate)
tools/eval          Evaluation scripts (Phase 5)
scripts             Repo-level helpers: env.mjs (env:init, env:check) and db.mjs (db:*)
docs                Brief, workflow, website guide, design guide, mockups, notes
```

## First run

```bash
pnpm bootstrap      # install JS dependencies, create the rag-service .venv, create each app's .env from .env.example
# fill in apps/api/.env, apps/rag-service/.env and infra/.env (never commit them)
pnpm env:check      # required variables set, DATABASE_URL and INTERNAL_SECRET agree across apps (values are never printed)
pnpm db:up          # local Postgres 16 + pgvector (Podman or Docker) on port 5433
pnpm db:migrate     # apply infra/sql migrations once each (tracked in schema_migrations)
pnpm dev            # api :3000, web :5173, rag-service :8000
```

Environment files live with their app: `apps/api/.env`, `apps/rag-service/.env`, `apps/web/.env` (only `VITE_` variables) and `infra/.env` (database password and Supabase connection strings). There is no repo-root `.env`. Each app loads only its own file plus the real environment. Without a compose provider the db scripts use `podman run`; with Docker, `docker compose --env-file infra/.env up -d db` also works.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev`, `dev:api`, `dev:web`, `dev:rag` | Start every app, or one |
| `pnpm build` | Build the web app and download the pinned RAG model files for offline runtime |
| `pnpm test` | Every app's tests, one app at a time (the apps share the `lumen_test` database) |
| `pnpm typecheck`, `lint`, `format` | TypeScript (tsc, Biome) and Python (ruff) checks |
| `pnpm check` | typecheck + lint + test |
| `pnpm db:up`, `db:down`, `db:psql`, `db:migrate`, `db:status` | Local database and migrations |
| `pnpm env:init`, `env:check` | Create or verify the per-app `.env` files |
| `pnpm clean` | Remove build and tool caches |

Tests need a test database once: `pnpm db:psql` then `CREATE DATABASE lumen_test;`. Apps document their own scripts in `apps/*/README.md`. Python commands go through `python -m app.cli` (see `apps/rag-service/README.md`).

## Dashboard (apps/web)

`pnpm dev:web` serves the dashboard at http://localhost:5173. It talks to the API at `VITE_API_URL`. Vite reads variables only from `apps/web/.env`, and only `VITE_` ones reach the browser. In development `VITE_API_URL` defaults to `http://localhost:3000`, so the file is optional; a production build has no default and shows a "Missing VITE_API_URL" screen if it is unset. The API's `DASHBOARD_ORIGIN` must be the dashboard's origin for sign-in cookies and CORS.
