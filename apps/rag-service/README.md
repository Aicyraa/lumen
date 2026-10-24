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
  retrieval/          embeddings, BM25/pgvector store, reranker, router (decide), ask_chunks
  llm/                client (call_model, Attempt), quote-backed prompt and rendering, endpoint_guard
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

## Retrieval and answers

`POST /internal/query` accepts an optional `force_tier` (`"cheap"` or `"expensive"`), used by the evaluation scripts and never forwarded by the API. It replaces the router's tier choice: the tier and `k` (`k_cheap` or `k_expensive`) follow it, `route.escalated` is `false` and `difficulty` is still reported. Retrieval, reranking, quote validation, the no-documents and not-found replies (still tier `none`, no model call) and model ordering are unchanged. Any other value is `422 invalid_request`.

The API combines tenant-local BM25 and vector candidates using reciprocal rank fusion, reranks up to the configured candidate count, then sends the selected passages to the tenant's chat model. Source scores remain cosine similarity. BM25 statistics use only the caller's tenant; new uploads and deletions are reflected without a separate search index or a database migration. This exact implementation computes corpus statistics per request; benchmark larger tenants before introducing a persistent index.

The reranker uses the installed `sentence-transformers` library and a pinned model revision from `app/config.yaml`. Prefetch its weights once, from this directory, before starting a new deployment:

```sh
.venv/bin/python -c 'from app.core.config import load_config; from huggingface_hub import snapshot_download; c = load_config()["reranker"]; snapshot_download(c["model"], revision=c["revision"], allow_patterns=["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt"])'
```

At request time the reranker loads cached weights only. Missing weights or invalid inference scores produce a warning and use fused retrieval order. Automated tests replace inference with deterministic fakes. `reranker.enabled` controls this step; model, revision, candidate count and batch size are configuration values. The CLI `ask` displays fused retrieval without reranking.

Chat models return claims with passage ids and exact evidence quotes. The service validates the quotes, tolerating whitespace and equivalent PDF typography, and renders ASCII citations itself. A quote assigned to the wrong passage is corrected only when it matches exactly one other provided passage. Invalid evidence gets one format-repair attempt, then `502 provider_error`; every attempt contributes to recorded usage. Empty claims produce the configured not-found message. Quote verification checks text presence, not logical entailment: a real quote does not by itself prove every interpretation of a claim.
