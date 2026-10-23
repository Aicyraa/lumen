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
`INTERNAL_SECRET`, `RAG_SERVICE_URL`, `MAX_DOCUMENTS_PER_TENANT`, `RATE_LIMIT_PER_MINUTE` or `MAX_REQUESTS_PER_MONTH`
is missing. Google/GitHub sign-in is skipped while its client id/secret are empty; email + password always works.

Other tunables live in `config.json` (ingest timeout, interrupted-ingest cutoff, global LLM cap per minute, upload
limit, page sizes). Each can be overridden by an upper-snake env var, for example `INGEST_TIMEOUT_MS`.

`globalLlmCapPerMinute` defaults to 8 (`GLOBAL_LLM_CAP_PER_MINUTE`). Groq documents base limits of 30 requests per
minute and 8K tokens per minute for `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. One chat call uses roughly
700-1500 tokens, so tokens per minute, not requests, is the binding limit.

## Dev-only API key

No browser needed. Sign up with email + password (`POST /api/auth/sign-up/email`), then:

```sh
curl -s localhost:3000/dev/api-key -H "x-internal-secret: $INTERNAL_SECRET" \
  -H 'content-type: application/json' -d '{"email":"you@example.test"}'
# {"tenant_id":"<organization id>","api_key":"..."}   use as: -H "x-api-key: ..."
```

The route needs the internal secret and is mounted only when `NODE_ENV=development` (unset or any other value: not mounted). `pnpm dev` does not set it; start with `NODE_ENV=development`.
Real keys are made in the dashboard with the API key plugin.
