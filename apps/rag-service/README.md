# @lumen/rag-service

Python RAG service: ingestion, retrieval, routing and LLM calls behind `/internal/*`. Only the Express API calls it (header `X-Internal-Secret`).

## Structure

```text
pyproject.toml        dependencies (single source), pytest and ruff config
.env.example          every variable, empty; copy to .env
app/
  main.py             uvicorn entry (app.main:app): loads .env, creates the app
  cli.py              python -m app.cli <command>
  config.yaml         models, router thresholds, limits, messages
  api/                factory (app, error handlers), routes, deps (secret, LLM caller), schemas
  core/               config loader and settings, env loader, errors, logging
  ingest/             chunking, text extraction, ingest_file (used by the CLI)
  retrieval/          embeddings, pgvector store, router (decide), ask_chunks
  llm/                client (call_model, Attempt), prompt, endpoint_guard
samples/              sample documents
tests/                mirrors app/ (api, core, ingest, retrieval, llm) plus conftest.py
```

## Commands

Run from `apps/rag-service` (or `pnpm --filter @lumen/rag-service <script>`).

| Script | What it does |
| --- | --- |
| `bootstrap` | creates `.venv` and runs `pip install -e ".[dev]"` |
| `dev` | `python -m app.cli dev`: uvicorn with reload on `RAG_PORT` (default 8000) |
| `test` | `python -m app.cli test`: pytest; extra args pass through (`pnpm test -- -k router`) |
| `typecheck` | `ruff check` plus a syntax compile (no type checker) |
| `lint` / `format` | `ruff check` / `ruff format` (line length 100) |
| `check-env` | lists required variables that are missing or empty; never prints a value |
| `clean` | removes caches and `__pycache__` |

The handler also has `ingest <tenant_id> <file>` (.txt, .md, .pdf) and `ask <tenant_id> "<question>"` (top 3 chunks, no LLM):
`.venv/bin/python -m app.cli ingest tenant_a samples/harbor_cafe_handbook.md`.
`ingest` creates the tenant's `tenants` row if missing (local testing only); the service endpoint does not, because the API inserts it before the document. Chunk counts are not stored: read them from the `document_stats` view.

## Environment

The app reads only `apps/rag-service/.env` plus the real environment (real variables win). There is no repo-root `.env` lookup.
`DATABASE_URL` and `INTERNAL_SECRET` are required; the service refuses to start without them. `INTERNAL_SECRET` must equal the one in `apps/api/.env`.
Tests use `TEST_DATABASE_URL`, or `DATABASE_URL` with the database name replaced by `lumen_test` (every `infra/sql/NNN_*.sql` is applied in order; tests insert the `tenants` rows they need). Tests use a fake LLM client and never call a provider.
