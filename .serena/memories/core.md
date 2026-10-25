# Lumen core

Multi-tenant RAG gateway (upload docs, get a key, call `POST /v1/chat`). Source of truth: `docs/AI_BUILD_BRIEF.md` (wins over `docs/DESIGN.md`, `docs/PROJECT_WORKFLOW.md`, `docs/WEBSITE_GUIDE.md`, `AGENTS.md`). Schema: `docs/DATABASE.md` + `infra/sql/NNN_*.sql`.

State (2026-10-25): Phases 0-5 done plus extra phases R2 (monorepo restructure), DB (normalized schema, applied to local DBs and Supabase project `lumen`), 4B/4C/4D/4E (accounts, projects, UI, fallback tier removed), rate-limit handling. Phase 5 evaluation finished but PRELIMINARY (drafted answers, see `mem:eval`). Phase 6 (classifier) only if the rule router misroutes; Phase 7 (Lumen pricing) on hold.

Monorepo (pnpm + Turborepo): `apps/api` (Express+Better Auth, TS, src/modules/<feature> + src/shared), `apps/rag-service` (FastAPI, app/{api,core,ingest,retrieval,llm}), `apps/web` (React/Vite, src/{app,features,shared}, tests in test/), `tools/eval` (evaluation + isolation suite), `infra/sql`, `scripts/` (env.mjs, db.mjs), `docs/`.

Invariants:
- Every SQL on tenant data filters `tenant_id` (tenants registry FK + cascade); cross-tenant ids return 404; tenant comes from session/key, never the body.
- rag-service is internal; every endpoint but `/internal/health` needs `X-Internal-Secret`.
- Provider keys are encrypted (AES-256-GCM), never returned/logged; tenant endpoint URLs are SSRF-guarded in both services.
- Two model tiers only (cheap, expensive; backups inside a tier). No Lumen pricing; tenant's estimated provider cost only.
- Test-first (`test:` red, then `feat:`/`fix:`), never merge/push without the user's approval.

Related: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`, `mem:eval`, `mem:agents_and_tools`.
