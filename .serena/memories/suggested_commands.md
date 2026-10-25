# Commands

- Root: `pnpm bootstrap`, `pnpm dev` (api :3000, web :5173, rag :8000), `pnpm check`, `pnpm test` (apps one at a time), `pnpm typecheck|lint|format|build|clean`, `pnpm db:up|db:down|db:psql|db:migrate|db:status`, `pnpm env:init|env:check`, `pnpm eval:isolation`.
- Env files live per app: `apps/api/.env`, `apps/rag-service/.env`, `apps/web/.env`, `infra/.env`, `tools/eval/.env`; no repo-root `.env`. Never print values.
- rag-service: `python -m app.cli dev|test|lint|format|check-env|ingest|ask` (from `apps/rag-service`, with its `.venv`; a worktree without a venv can borrow the main checkout's interpreter with the worktree as cwd).
- Evaluation: `python tools/eval/run_eval.py [--dry-run|--limit N|--resume]` (see `mem:eval`).
- Migrations: numbered files in `infra/sql/` applied once each by `pnpm db:migrate`; Better Auth tables by `pnpm --filter @lumen/api auth:migrate`.
- Never `pkill -f`; kill by PID. `pnpm setup`/`pnpm init` are pnpm builtins (script is `bootstrap`).
- Graph refresh: `graphify update .`
