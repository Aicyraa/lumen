# Lumen core

Multi-tenant RAG gateway. Source of truth: `AI_BUILD_BRIEF.md` (wins over `DESIGN.md`, `PROJECT_WORKFLOW.md`, `AGENTS.md` on conflict). Application code starts at Phase 1; before that the repo is scaffold only.

Layout: `api/` (Express+Better Auth, ESM), `rag-service/` (FastAPI, Python), `web/` (React dashboard, follows `DESIGN.md`), `test-site/` + `eval/` (Phase 5-6), `infra/sql/001_app_tables.sql` (schema), `NOTES.md` (dated log).

Invariants:
- Every SQL touching `documents`/`chunks`/`request_logs` filters `tenant_id`; cross-tenant ids return 404.
- rag-service is internal-only; all endpoints except `/internal/health` need `X-Internal-Secret`.
- No hardcoded model names, thresholds, limits; no secrets in code/logs.
- Money last: no prices/costs before Phase 7 (`cost_usd` stays null).
- One phase at a time, test-first (`test:` commit red, then `feat:`/`fix:`); never merge/push without user approval.

Module memories: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.
