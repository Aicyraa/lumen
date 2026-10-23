# apps/api

Express + Better Auth (ES modules). Reads configuration from the repo-root `.env` (real environment variables win).

## Run

```sh
pnpm db:up                          # from the repo root: start Postgres
pnpm --filter @lumen/api auth:migrate   # create/update Better Auth's tables (re-run after adding a plugin)
pnpm --filter @lumen/api dev            # http://localhost:3000 (runs src/server.ts with tsx; no build step)
pnpm --filter @lumen/api typecheck
pnpm test                               # tsc --noEmit, then Vitest + supertest, uses the lumen_test database only
```

The server refuses to start while `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DASHBOARD_ORIGIN`,
`INTERNAL_SECRET`, `RAG_SERVICE_URL`, `MODEL_KEY_ENCRYPTION_SECRET` (exactly 64 hex characters; changing it makes stored model keys unreadable), `MAX_DOCUMENTS_PER_TENANT`, `RATE_LIMIT_PER_MINUTE` or `MAX_REQUESTS_PER_MONTH`
is missing. Google/GitHub sign-in is skipped while its client id/secret are empty; email + password always works.

Other tunables live in `config.json` (ingest timeout, interrupted-ingest cutoff, global LLM cap per minute, upload
limit, page sizes). Each can be overridden by an upper-snake env var, for example `INGEST_TIMEOUT_MS`.

`globalLlmCapPerMinute` defaults to 8 (`GLOBAL_LLM_CAP_PER_MINUTE`). Groq documents base limits of 30 requests per
minute and 8K tokens per minute for `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. One chat call uses roughly
700-1500 tokens, so tokens per minute, not requests, is the binding limit.

## Tenant models (Phase 3B)

`/api/dashboard/models` (session) manages a tenant's own provider models: list, add (Test & save makes one tiny
completion first and saves nothing on failure), move up/down within a tier, remove, optional per-1M-token prices,
and `/models/usage?range=7d|30d`. Keys are AES-256-GCM encrypted (bound to the tenant id), only a masked hint is
ever returned, and endpoint URLs go through `lib/endpointGuard.ts` (https only, `http://localhost` outside
production, private/loopback/link-local/metadata addresses refused, checked again at connect time, no redirects).
`/v1/chat` and `/api/dashboard/try` send the decrypted models to `/internal/query`, write one `model_calls` row per
attempt, and return `usage.cost_usd` as the tenant's estimated provider cost (null when the model has no price).
With no models: production answers `422 no_models_configured`, other environments let the Python service use its
`LLM_*` default. The global LLM cap applies only to that shared default key.
Apply `infra/sql/002_tenant_models.sql` to the dev database (`psql "$DATABASE_URL" -f infra/sql/002_tenant_models.sql`); tests apply it to `lumen_test` themselves.

## Dev-only API key

No browser needed. Sign up with email + password (`POST /api/auth/sign-up/email`), then:

```sh
curl -s localhost:3000/dev/api-key -H "x-internal-secret: $INTERNAL_SECRET" \
  -H 'content-type: application/json' -d '{"email":"you@example.test"}'
# {"tenant_id":"<organization id>","api_key":"..."}   use as: -H "x-api-key: ..."
```

The route needs the internal secret and is mounted only when `NODE_ENV=development` (unset or any other value: not mounted). `pnpm dev` does not set it; start with `NODE_ENV=development`.
Real keys are made in the dashboard with the API key plugin.

## Layout

```
config.json          tunable defaults (overridable by env vars)
scripts/migrate.ts   `auth:migrate`, creates/updates Better Auth's tables
src/
  server.ts          entry: load config, start listening, run the startup ingest sweep
  app.ts             builds the Express app, mounts middleware and routes
  config/            config.ts (env + config.json -> Config), env.ts (loads the repo-root .env)
  db/                pool.ts, the pg pool
  auth/              auth.ts, Better Auth setup (organizations, API keys)
  middleware/        rateLimit, requireApiKey, requireSession, tenantModels
  routes/            HTTP handlers: chat, documents, feedback, models, dev
  services/          non-HTTP logic: rag.ts (rag-service client), provider.ts (Test & save call), modelCalls.ts (attempts, cost), sweep.ts
  lib/               errors.ts (error shape), crypto.ts (AES-256-GCM), endpointGuard.ts (SSRF guard), logger.ts (key redaction)
  types/             types.ts, shared types (Deps)
test/                mirrors src: auth, config, middleware, routes, services; helpers/ and global-setup.ts
```
