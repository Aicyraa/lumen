# Task completion

- Run `pnpm check` (typecheck + lint with Biome and ruff + all tests) and show real output; isolation and delete tests must pass.
- grep SQL for `tenant_id` in every statement touching `chunks`/`documents`/`request_logs`.
- Run `lumen-reviewer` on the diff; lead re-runs acceptance checks itself.
- `graphify update .`; append dated entry to `docs/NOTES.md`.
- Biome (TypeScript) and Ruff (Python) are the lint/format tools; `pnpm format` before committing.
