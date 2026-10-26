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
| `bootstrap` | creates `.venv`, installs dependencies pinned by `constraints.txt` and downloads the model files |
| `build` | `python -m app.cli download-models`: saves the configured, pinned embedding and enabled reranker models inside `app/models/` |
| `dev` | `python -m app.cli dev`: uvicorn with reload on `RAG_PORT` (default 8000); sets `NODE_ENV=development` when it is empty |
| `serve` | `python -m app.cli serve`: production start, no reload, `RAG_HOST` (default 127.0.0.1), `RAG_PORT`, `RAG_WORKERS` (default 1; each worker loads both models) |
| `test` | `python -m app.cli test`: pytest; extra args pass through (`pnpm test -- -k router`) |
| `typecheck` | `ruff check` plus a syntax compile (no type checker) |
| `lint` / `format` | `ruff check` / `ruff format` (line length 100) |
| `check-env` | lists required variables that are missing or empty; never prints a value |
| `clean` | removes caches and `__pycache__` |

The handler also has `ingest <tenant_id> <file>` (.txt, .md, .pdf) and `ask <tenant_id> "<question>"` (top 3 chunks, no LLM):
`.venv/bin/python -m app.cli ingest tenant_a samples/harbor_cafe_handbook.md`.
`ingest` creates the tenant's `tenants` row if missing (local testing only); the service endpoint does not, because the API inserts it before the document. Chunk counts are not stored: read them from the `document_stats` view.

Ingest limits and errors (`/internal/ingest`): `ingest.max_pages` and `ingest.max_chunks` give `422 document_too_large` before any embedding; a corrupt or encrypted PDF is `422 unreadable_document`; `ingest.max_chunk_tokens` (estimated as the larger of the word count and characters / `ingest.chars_per_token`, not a real tokenizer) splits chunks that could pass the embedding model's window. A document marked `failed` gets no chunks (`409 document_not_ingestable`). Model work is bounded per process by `concurrency.embed_max`, `rerank_max` and `ingest_max`; an upload that waits longer than `concurrency.ingest_wait_seconds` gets `503 busy` with `Retry-After`, and so does a query that waits longer than `concurrency.query_wait_seconds` for an embed or rerank slot. The database pool also answers `503 busy` when no connection frees up within `database.pool_timeout_seconds`.

## Production start

```sh
NODE_ENV=production LOG_LEVEL=INFO RAG_WORKERS=2 .venv/bin/python -m app.cli serve
# or: .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
```

No `--reload`, and bind to 127.0.0.1: only the Express API calls this service. Every worker loads the embedder and the reranker and has its own database pool (`database.pool_max_size`) and its own model semaphores, so size workers by memory and CPU. Liveness: `GET /internal/health`; readiness (database connection and models loaded): `GET /internal/ready` (sends `X-Internal-Secret`). Only health is public.

## Logging

`lumen.rag` lines go to stderr at `LOG_LEVEL` (default INFO), one line each: `time level=INFO logger=lumen.rag msg=...`. They carry tenant ids, counts, tiers, outcomes and latencies, never keys, prompts, passages, questions or snippets.

## Dependencies

`pyproject.toml` lists the direct dependencies; `constraints.txt` pins everything they resolve to (without torch and CUDA packages, which CI installs as the CPU build first). Install with `pip install -c constraints.txt -e ".[dev]"`. To refresh after changing dependencies: install from `pyproject.toml` unconstrained in a clean venv, run the tests, then rewrite `constraints.txt` from `pip freeze --exclude-editable`, minus `torch`, `triton`, `nvidia-*` and `cuda-*`, sorted, one `name==version` per line (a test checks the direct dependencies are all pinned).

## Environment

The app reads only `apps/rag-service/.env` plus the real environment (real variables win). There is no repo-root `.env` lookup.
`DATABASE_URL`, `INTERNAL_SECRET` and `NODE_ENV` are required; the service refuses to start without them. The service is production unless `NODE_ENV` is `development` or `test` (empty or misspelled counts as production): only then the `LLM_*` default model and `http://localhost` endpoints are allowed. `LOG_LEVEL`, `RAG_HOST` and `RAG_WORKERS` are optional. `INTERNAL_SECRET` must equal the one in `apps/api/.env`.
Tests use `TEST_DATABASE_URL`, or `DATABASE_URL` with the database name replaced by `lumen_test` (every `infra/sql/NNN_*.sql` is applied in order, including 011, the stored BM25 tsvector; tests insert the `tenants` rows they need). Tests use a fake LLM client and never call a provider.

## Retrieval and answers

`POST /internal/query` accepts an optional `force_tier` (`"cheap"` or `"expensive"`), used by the evaluation scripts and never forwarded by the API. It replaces the router's tier choice: the tier and `k` (`k_cheap` or `k_expensive`) follow it, `route.escalated` is `false` and `difficulty` is still reported. Retrieval, reranking, quote validation, the no-documents and not-found replies (still tier `none`, no model call) and model ordering are unchanged. Any other value is `422 invalid_request`.

The API combines tenant-local BM25 and vector candidates using reciprocal rank fusion, reranks up to the configured candidate count, then sends the selected passages to the tenant's chat model. Source scores remain cosine similarity. BM25 statistics use only the caller's tenant. Chunks keep a generated `tsv` tsvector column with a GIN index (migration 011), so new uploads and deletions are reflected at once; term frequencies come from the chunks matching the query, while corpus size and average length still scan the tenant's `tsv` column per request (about 0.7 s for 10,000 chunks, down from about 4 s). The first dense search of a query also supplies `best_score`; there is no separate probe query.

The embedding model and reranker use the installed `sentence-transformers` library
and pinned revisions from `app/config.yaml`. Download their files before starting
the service or running tests:

```sh
pnpm --filter @lumen/rag-service build  # from the repo root; pnpm build also runs this
```

`bootstrap` does this automatically on first setup. The command downloads from
Hugging Face (or reuses already cached weights) and saves self-contained copies in
`app/models/<embedding|reranker>/<revision>/`. These generated files are ignored by
Git and included in Python package data. Run this build command before packaging
the service. A failed download fails the build. Models are rebuilt without Turborepo task caching so an absent
local artifact cannot be mistaken for a successful cached build.

Runtime loads only those bundled files and makes no Hugging Face requests. A
missing embedding model prevents startup; rebuild to restore it. The reranker loads at startup with the embedder. Missing reranker
weights or invalid inference scores retain the warning (it names the exception class only) and fused-order
fallback; `/internal/ready` reports 503 while an enabled reranker is not loaded. A disabled reranker is not downloaded. Automated tests replace reranker
inference with deterministic fakes. `reranker.enabled` controls this step; model,
revision, candidate count and batch size are configuration values. The CLI `ask`
displays fused retrieval without reranking.

For an offline check after building, run from `apps/rag-service`:

```sh
HF_HUB_OFFLINE=1 .venv/bin/python -c 'from app.retrieval.embeddings import embed; assert embed(["offline check"]).shape == (1, 384)'
```

Changing either model or revision requires rebuilding its files. Changing the
embedding model still requires re-embedding stored documents; bundling does not
change the model, vector dimensions or existing data.

Chat models return claims with passage ids and exact evidence quotes. The service validates the quotes, tolerating whitespace and equivalent PDF typography, and renders ASCII citations itself. A quote assigned to the wrong passage is corrected only when it matches exactly one other provided passage. A quote shorter than `llm.min_quote_chars` or `llm.min_quote_words` (unless the whole passage is shorter) is invalid evidence. Invalid evidence gets one format-repair attempt, then `502 provider_error`; every attempt contributes to recorded usage.

Provider rate limits: on a 429 the service reads `retry-after` (seconds), or else the slowest `x-ratelimit-reset-*` header (durations such as `8m38.4s` are understood), and stores it on the attempt as `retry_after_seconds`. If the wait is at most `llm.rate_limit_max_wait_seconds` (default 10), it sleeps that long and retries once (with no header it waits `llm.rate_limit_retry_seconds`, default 2); a longer wait is not slept: the attempt ends as `rate_limited` and the next model of the tier is tried at once. When every attempt of the tier was `rate_limited`, the query returns `429` with a `Retry-After` header and `{"error": {"code": "provider_rate_limited", "message": ..., "retry_after_seconds": N}, "attempts": [...]}`, where N is the smallest wait among the attempts. Any other mix of failures stays `502 provider_error`. Empty claims produce the configured not-found message. Quote verification checks text presence, not logical entailment: a real quote does not by itself prove every interpretation of a claim.
