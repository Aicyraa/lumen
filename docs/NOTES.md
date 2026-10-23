# Notes

## 2026-10-23

- Phase 0 scaffold created: folders, docker-compose.yml, .env.example, infra/sql/001_app_tables.sql, README.

- Phase 0 acceptance checked by lead (Podman, no compose provider): db container starts; `\dx` lists vector 0.8.7; 001_app_tables.sql applies cleanly creating documents, chunks, request_logs; `.env` git-ignored and untracked. PASSED.
- Host port 5432 is taken by a system Postgres, so the dev DB maps to host port 5433 (`docker-compose.yml`, `DATABASE_URL` in `.env`).
- Podman equivalent of `docker compose up -d db`: `podman run -d --name lumen-db -p 5433:5432 -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD -e POSTGRES_DB=lumen -v lumen_db_data:/var/lib/postgresql/data docker.io/pgvector/pgvector:pg16`

## 2026-10-23 Phase 1 (RAG core)

- Built by rag-engineer on `phase-1-rag-core`; test-first (`test:` red stubs before each `feat:`). Python 3.14 worked with torch/sentence-transformers.
- Lead checks: pytest 16 passed; every SQL in store.py filters tenant_id; ask.py re-run on the sample handbook gave the right chunk in the top 3 (engineer's 5-question table: rank 1 for all, refund also rank 2); dev DB cleaned afterwards. lumen-reviewer: no blocking findings.
- Known: chunk() defaults 120/30 in code (dictated by prompt); delete_document count not atomic under concurrent inserts; embeddings load at import (~3s).

## 2026-10-23 Phase 2 (Python service)

- FastAPI service in rag-service/app (main, router, llm, config) built test-first on `phase-2-python-service`; 81 tests pass (lead re-ran). Reviewer: no rule violations; two low findings (NUL-byte upload 500, duplicate chunks on re-ingest) fixed in `85ae599`/`9c29422`.
- Lead checks: curl ingest then query with the real Groq test key (TEST_LLM_API_KEY, test only): answered with `[1]`, unrelated question returned the not-found message with zero model calls, cost_usd null, key absent from logs. Dev DB cleaned.
- Brief's Groq models (llama-3.1-8b-instant, llama-3.3-70b-versatile) return model_not_found for this key. Tested with openai/gpt-oss-20b (cheap) and openai/gpt-oss-120b (expensive) via env. gpt-oss emits `【1†L1-L4】` style citations at times; revisit when choosing models.
- Python does not write request_logs (Express will, using the returned request_id). Errors use `{error:{code,message}}`; Express reads `error.code`. Delete of another tenant's id returns 200 deleted_chunks 0.
- Open: `route.top_score` not in contract (needed by Phase 4 unanswered view); needs a brief change.

## 2026-10-23 Phase R (folder structure refactor, extra phase)

- Moved to a Turborepo + pnpm monorepo: apps/{api,web,rag-service}, tools/eval, docs/, infra/ stay; root has only tooling. rag-service wrapped by package.json (bootstrap, dev, test). `pnpm test` runs the 81 rag-service tests green from the root (lead ran it).
- Dropped the fake test website (outside work); Phase 5 now calls the public API directly. Brief, workflow, AGENTS.md and agent files updated for new paths.
- Brief amended: route.top_score added to the chat response (code change still to do in rag-service); Groq models now openai/gpt-oss-20b and openai/gpt-oss-120b.
- Root `index.tsx` (empty) removed; lucide-react moved from the root to apps/web.

## 2026-10-23 Phase 3 (Express API + Better Auth)

- Built in apps/api by api-engineer on `phase-3-express-api` (plain .js, ESM; brief layout says .ts: open decision). 67 tests; lead re-ran. Reviewer: no hard-rule violations; low findings: dev-key route open when NODE_ENV unset, monthly count not atomic and counts provider errors, `monthly_limit` code not in brief, sweep skips orphaned tenants, in-memory rate limiter (single instance).
- Real e2e (rag-service + API, Groq test key): email sign-up creates personal org, upload reaches ready, chat answered with one request_logs row (tokens, latency, cost null), kill mid-ingest then restart sweeps to failed with no chunks, 401/404 isolation, shared 429 between /v1/chat and /api/dashboard/try. Google/GitHub browser sign-in NOT run (no OAuth credentials); email+password added as a third sign-in method.
- Better Auth 1.7.12 findings: apiKey({references:"organization"}); verifyApiKey returns key.referenceId as tenant; plugin rate limit defaults to 10/day per key, so disabled; `npx auth@latest migrate` unusable, use getMigrations via `pnpm auth:migrate`; Express 5 route `/api/auth/*splat`.
- Bug caught: Python DELETE /internal/documents also deletes the documents row, so Express must not call it for failed ingests (deletes partial chunks itself, tenant-scoped).
