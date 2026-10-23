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
`usage.cost_usd` is only ever the tenant's estimate from the prices on their own models. The one exception is an
attempt's optional `reported_cost_usd`, which Express accepts only when the attempt succeeded and the value is a finite
number >= 0 (the provider's own bill for that call). **The Python service must never send a cost it derived from a
price of its own**, and has no prices to derive one from. Before each request Express re-checks every model's endpoint
host (cached for `endpointGuardCacheTtlMs`); a host that now resolves to a private address is dropped, its key is
never sent, and the model is marked `failing`.
Limits for this feature (attempt cap, stored rate-limit header cap, field lengths, Test & save token budget, response
size cap, price ceiling) live in `config.json` and can be overridden by upper-snake env vars such as `MODEL_ATTEMPTS_MAX`.
With no models: production answers `422 no_models_configured`, other environments let the Python service use its
`LLM_*` default. The global LLM cap applies only to that shared default key.
Apply `infra/sql/002_tenant_models.sql` to the dev database (`psql "$DATABASE_URL" -f infra/sql/002_tenant_models.sql`); tests apply it to `lumen_test` themselves.

## Dashboard endpoints (Phase 4)

All are under `/api/dashboard`, need the Better Auth session cookie (`401 unauthorized` otherwise) and use the session's
active organization as the tenant. Every query filters by `tenant_id`; another tenant's id is `404 not_found`, and so is a
non-UUID id. Errors are `{ "error": { "code", "message" } }`; a bad `range`, `tier`, `limit` or `cursor` is `422 invalid_request`.
`range` is `7d` (default) or `30d` and means whole UTC days, today included. Cost is always the tenant's
**estimated provider cost** (`null` when no priced model answered). There is no savings figure and no Lumen price.
Browser calls need `credentials: "include"`; CORS allows `DASHBOARD_ORIGIN` with credentials (GET/POST/PATCH/DELETE).

| Endpoint | Response |
| --- | --- |
| `GET /usage` | `{ documents: {used,max}, requests_per_minute: {used,max}, requests_this_month: {used,max} }`. `max` = `MAX_DOCUMENTS_PER_TENANT`, `RATE_LIMIT_PER_MINUTE`, `MAX_REQUESTS_PER_MONTH`; per-minute `used` is the rate limiter's own counter (shared by `/v1/chat` and `/try`); the month is the calendar month in UTC |
| `GET /analytics/summary?range=` | see below |
| `GET /analytics/unanswered?range=` | `{ range, threshold, total, items: [{ id, query, top_score, tier, time }] }`, newest first, at most `unansweredPageSize` items. An item is tier `none` or a best match below `threshold` (`unansweredScoreBelow`) |
| `GET /requests?range=&tier=all\|cheap\|expensive\|none&limit=&cursor=` | `{ items: [{ id, time, query, tier, k, escalated, latency_ms, tokens_in, tokens_out, cost_usd, status }], next_cursor }`. Newest first; `limit` defaults to `requestsPageSizeDefault` and is capped at `requestsPageSizeMax`; pass `next_cursor` back as `cursor` (`null` = last page). A failed call (provider error) has `tier: null`, shown under `all` only |
| `GET /requests/:id` | see below |
| `POST /feedback` `{ request_id, rating: 1 \| -1 }` | `204`; for the Try it "Helpful?" buttons (`request_id` is the `request_id` of the try response). `404` for another tenant's request |
| `GET /documents` | `{ documents: [{ document_id, filename, status: "processing"\|"ready"\|"failed", error, chunk_count, created_at }] }`, newest first |
| `POST /documents`, `DELETE /documents/:id`, `POST /try`, `/models...` | as in the brief, section 6 (Phase 3 and 3B) |

`GET /analytics/summary` (days with no traffic are present with zeros, oldest first, today last; `failed` counts calls whose
provider failed, so `cheap + expensive + none + failed` is the day's total):

```json
{
  "range": "7d",
  "total_requests": 6,
  "per_day": [{ "date": "2026-10-23", "cheap": 2, "expensive": 1, "none": 0, "failed": 0, "cost_usd": 0.011 }],
  "route_mix": { "cheap": 2, "escalated": 1, "expensive_hard": 1, "none": 1, "failed": 1 },
  "latency_ms": { "median": 300, "p95": 1140 },
  "total_cost_usd": 0.031,
  "by_model": [{ "id": "uuid", "tier": "cheap", "position": 0, "provider": "openai_compatible", "model_id": "m1", "status": "connected",
                 "rate_limits": null, "rate_limits_seen_at": null, "requests": 4, "tokens_in": 300, "tokens_out": 30,
                 "failures": { "error": 1, "timeout": 1, "rate_limited": 0 }, "backup_uses": 0, "fallback_uses": 0,
                 "median_latency_ms": 200, "cost_usd": 0.003 }]
}
```

`escalated` is tier `expensive` with `escalated: true` (the router was cautious); `expensive_hard` is tier `expensive`
without it. Latency covers answered requests only (`status = ok`). `per_day[].cost_usd` and `total_cost_usd` sum
`request_logs.cost_usd` (null when nothing in the period was priced). `by_model` is exactly the `models` array of
`GET /models/usage` for the same range (fallback models and unused models included, `cost_usd` per model).

`GET /requests/:id`. The passage is read from `chunks` when the request is opened (tenant-scoped join, cut to
`passageMaxChars`) and is never stored or logged:

```json
{
  "id": "uuid", "time": "2026-10-23T10:15:00.123456Z", "query": "When does enrollment close?", "status": "ok",
  "route": { "tier": "expensive", "k": 8, "escalated": true, "difficulty": 0.62, "top_score": 0.78 },
  "usage": { "tokens_in": 812, "tokens_out": 96, "latency_ms": 820, "cost_usd": 0.0042 },
  "feedback": -1,
  "api_key": { "id": "...", "name": "website bot", "start": "abcde", "prefix": null },
  "sources": [
    { "document_id": "uuid", "chunk_id": 12, "score": 0.78, "filename": "handbook.pdf", "document_deleted": false, "passage": "Spring enrollment closes..." },
    { "document_id": "uuid", "chunk_id": 99, "score": 0.5, "filename": null, "document_deleted": true, "passage": null }
  ]
}
```

`api_key` is `null` for Try it requests, a deleted key, or a key that is not this tenant's. A source whose chunk is gone
(re-ingested) has its `filename` and `passage: null`; a source whose document is gone has `document_deleted: true`
(show "deleted document"). Failed requests have `route.tier: null` and `status: "provider_error"`.

Config keys added to `config.json` (each can be overridden by an upper-snake env var, e.g. `UNANSWERED_SCORE_BELOW`):
`passageMaxChars` (300), `unansweredScoreBelow` (0.3, the same value as the Python router's `weak_score`),
`unansweredPageSize` (50). Existing: `requestsPageSizeDefault` (50), `requestsPageSizeMax` (200).

### API keys (Better Auth client, no custom routes)

Keys belong to the active organization (`apiKey({ references: "organization" })`). The tenant id is the session's
`activeOrganizationId` (`authClient.useSession().data?.session.activeOrganizationId`). With
`createAuthClient({ baseURL, plugins: [organizationClient(), apiKeyClient()] })`:

```ts
await authClient.apiKey.create({ name: "website bot", organizationId });   // data.key is shown once; data.id, data.start
await authClient.apiKey.list({ query: { organizationId } });               // data.apiKeys[] (no secret), data.total
await authClient.apiKey.delete({ keyId });                                 // revoke; data.success
```

`organizationId` is required for create. Another organization's id gives `403` on create, list and delete (the plugin checks
membership and the `apiKey` permission of the member's role; the creator/owner role has all of them). The new key
authenticates `/v1/*` as that tenant straight away.

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
  routes/            HTTP handlers: chat, documents, feedback, models, usage, requests, analytics, dev
  services/          non-HTTP logic: rag.ts (rag-service client), provider.ts (Test & save call), modelCalls.ts (attempts, cost), modelUsage.ts (per-model figures), sweep.ts
  lib/               errors.ts (error shape), range.ts (7d/30d, UTC month), crypto.ts (AES-256-GCM), endpointGuard.ts (SSRF guard), logger.ts (key redaction)
  types/             types.ts, shared types (Deps)
test/                mirrors src: auth, config, middleware, routes, services; helpers/ and global-setup.ts
```
