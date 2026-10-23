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

- Built in apps/api by api-engineer on `phase-3-express-api` (converted to TypeScript, run via tsx, ESM). 67 tests; lead re-ran. Reviewer: no hard-rule violations; low findings: dev-key route open when NODE_ENV unset, monthly count not atomic and counts provider errors, `monthly_limit` code not in brief, sweep skips orphaned tenants, in-memory rate limiter (single instance).
- Real e2e (rag-service + API, Groq test key): email sign-up creates personal org, upload reaches ready, chat answered with one request_logs row (tokens, latency, cost null), kill mid-ingest then restart sweeps to failed with no chunks, 401/404 isolation, shared 429 between /v1/chat and /api/dashboard/try. Google/GitHub browser sign-in NOT run (no OAuth credentials); email+password added as a third sign-in method.
- Better Auth 1.7.12 findings: apiKey({references:"organization"}); verifyApiKey returns key.referenceId as tenant; plugin rate limit defaults to 10/day per key, so disabled; `npx auth@latest migrate` unusable, use getMigrations via `pnpm auth:migrate`; Express 5 route `/api/auth/*splat`.
- Bug caught: Python DELETE /internal/documents also deletes the documents row, so Express must not call it for failed ingests (deletes partial chunks itself, tenant-scoped).
- Root `pnpm test` runs apps one at a time (`--concurrency=1`): api and rag-service tests share the lumen_test database and wipe each other when parallel. Lead ran root `pnpm test`: api 67 + rag-service 81 passed.
- Follow-up on the same branch: TypeScript port (74 tests plus tsc, lead ran root `pnpm test`: api 74 + rag-service 81), dev route only with NODE_ENV=development, global LLM cap default 8/min (Groq base limits for gpt-oss: 30 RPM, 8K TPM; tokens are the binding limit), logging failure no longer masks 502, `monthly_limit` code added to the brief. Reviewer: no blockers; the three fixes shared one commit and the red evidence is the engineer's report only.

## 2026-10-23 Alignment with docs/WEBSITE_GUIDE.md

- Decision: follow the guide for models. Tenants bring their own cheap, expensive and fallback models and provider keys (Models tab). `TEST_LLM_API_KEY` and the `LLM_*` variables are a dev/test default only. Brief updated: Phase 3B (backend) before Phase 4 (UI), `tenant_models` table, rules 11 (provider keys are secrets) and 12 (tenant endpoints are untrusted, SSRF), `MODEL_KEY_ENCRYPTION_SECRET`, tenant-model flow in section 7, Models endpoints in section 6.
- Conflicts left open for the human:
  1. Sign-in: guide says Google and GitHub only, no passwords; the brief now also enables email and password (added for local use).
  2. Phase 7 pricing: prices were one set in config.yaml per tier; with tenant-supplied models they must be per model. Marked OPEN in the brief.
  3. Try it "Sources: document, snippet, similarity score": the chat response has only document_id, chunk_id and score (no filename, no snippet) and the brief forbids storing chunk text. Needs a contract decision (filename join is fine; a snippet would be returned live but never stored).
  4. Requests drawer "source passages": brief stores ids and scores only; show filename and score, not passage text.
  5. FAQ "question retention": the brief forbids claiming or building a retention period; the home page FAQ must not mention it.
  6. Request ids: guide shows `req_...`, the service returns UUIDs.
  7. "Read the docs" and Docs/Privacy links on the home page: no docs or privacy page is specified anywhere.
  8. Global LLM cap (Phase 3) only protects the shared dev default key once tenants bring their own keys; per-tenant limits remain.
