# Lumen core

Multi-tenant RAG gateway. Source of truth: `docs/AI_BUILD_BRIEF.md` (wins over `docs/DESIGN.md`, `docs/PROJECT_WORKFLOW.md`, `AGENTS.md` on conflict). Application code starts at Phase 1; before that the repo is scaffold only.

Turborepo monorepo (pnpm): apps in `apps/`, root is tooling only; docs in `docs/`. test-site was dropped (out of scope).
Layout: `apps/api/` (Express+Better Auth, ESM), `apps/rag-service/` (FastAPI, Python), `apps/web/` (React dashboard, follows `docs/DESIGN.md`), `tools/eval/` (Phase 5-6), `infra/sql/001_app_tables.sql` (schema), `docs/NOTES.md` (dated log).

Invariants:
- Every SQL touching `documents`/`chunks`/`request_logs` filters `tenant_id`; cross-tenant ids return 404.
- rag-service is internal-only; all endpoints except `/internal/health` need `X-Internal-Secret`.
- No hardcoded model names, thresholds, limits; no secrets in code/logs.
- Money: no Lumen pricing/savings (Phase 7 on hold, no prices in code/config). Allowed: tenant's estimated provider cost from tenant-entered per-model prices.
- One phase at a time, test-first (`test:` commit red, then `feat:`/`fix:`); never merge/push without user approval.

Module memories: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.
