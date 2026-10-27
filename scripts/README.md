# scripts

Repo-level Node helpers (no dependencies) behind the root `package.json` scripts. Run them from the repo root with `pnpm <script>`. None of them prints a secret value.

| File | Root script | What it does |
| --- | --- | --- |
| `env.mjs` | `pnpm env:init` | Creates each app's `.env` (`apps/api`, `apps/rag-service`, `apps/web`, `infra`) from its `.env.example` when missing |
| `env.mjs` | `pnpm env:check` | Verifies the required variables are set and that `DATABASE_URL` and `INTERNAL_SECRET` agree across apps; prints names and OK/MISSING only |
| `db.mjs` | `pnpm db:up`, `db:down` | Starts or stops the local Postgres 16 + pgvector container (`lumen-db`, `127.0.0.1:5433`) with Podman or Docker; reads `infra/.env` |
| `db.mjs` | `pnpm db:psql` | Opens `psql` inside that container |
| `db.mjs` | `pnpm db:migrate`, `db:status` | Applies the numbered `infra/sql/NNN_*.sql` files in order, each once (recorded in `schema_migrations`), or lists which are applied and pending. See [infra/sql/README.md](../infra/sql/README.md) |
| `rag-funnel.mjs` | `pnpm rag:funnel` | Runs the rag-service in production mode on `127.0.0.1` with settings from `apps/rag-service/.env.funnel`, to be published through a Tailscale Funnel. `pnpm rag:funnel -- --check` only validates the file |
| `check-docs.mjs` | `node scripts/check-docs.mjs` | Fails when a relative link or file reference in a tracked Markdown file does not resolve. Not wired into CI |
| `lib.mjs` | none | Shared helpers: the repo root (`LUMEN_ROOT` overrides it, for tests only), the list of env directories and the `.env` parser |

`pnpm eval:isolation` runs `tools/eval/isolation/run.mjs`, which lives with the evaluation tool; see [tools/eval/README.md](../tools/eval/README.md).
