# Task completion

- Run the phase's tests and show real output (pytest for rag-service, Vitest for api); isolation and delete tests must pass.
- grep SQL for `tenant_id` in every statement touching `chunks`/`documents`/`request_logs`.
- Run `lumen-reviewer` on the diff; lead re-runs acceptance checks itself.
- `graphify update .`; append dated entry to `docs/NOTES.md`.
- No lint/format tooling configured yet.
