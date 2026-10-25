# Task completion

- Run `pnpm check` (typecheck + Biome/ruff lint + all tests; apps run one at a time) and show real output. If another agent uses `lumen_test`, run only the app you changed and say so.
- Tenant isolation: grep SQL for `tenant_id` on every statement touching tenant tables; `pnpm eval:isolation` must report zero leaks and detecting controls when retrieval or tenancy code changed.
- Run `lumen-reviewer` on the diff for any non-trivial change; the lead re-runs acceptance checks itself and reports what was NOT run.
- `graphify update .` after code changes; append a dated entry to `docs/NOTES.md`.
- `pnpm format` before committing (Biome for TS, ruff for Python).
- Ask before merging, before applying migrations to Supabase, and before anything outward-facing.
