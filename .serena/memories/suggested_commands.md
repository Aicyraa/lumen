# Commands

- Root (Turborepo + pnpm): `pnpm bootstrap`, `pnpm dev` (api :3000, web :5173, rag :8000), `pnpm check` (typecheck + lint + test), `pnpm test` (apps one at a time, they share lumen_test), `pnpm db:up|db:migrate|db:status|db:psql`, `pnpm env:init|env:check`.
- Env files live with their app (`apps/api/.env`, `apps/rag-service/.env`, `apps/web/.env`, `infra/.env`); no repo-root `.env`. Each app loads only its own.
- rag-service Python commands: `python -m app.cli dev|test|lint|format|check-env|ingest|ask` (from `apps/rag-service` with `.venv`).
- Never `pkill -f` in the shell; kill by PID from `ss -ltnp`. (`pnpm setup` and `pnpm init` are pnpm builtins, so the first-run script is called `bootstrap`.)
- Graph refresh after code changes: `graphify update .`
