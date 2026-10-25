# apps/api

Express + Better Auth (ES modules). Reads configuration only from `apps/api/.env` (copy `.env.example`; real environment variables win). There is no repo-root `.env` lookup.

## Run

```sh
pnpm db:up                              # from the repo root: start Postgres
pnpm --filter @lumen/api auth:migrate   # create/update Better Auth's tables (re-run after adding a plugin)
pnpm --filter @lumen/api dev            # http://localhost:3000 (tsx watch src/server.ts; no build step)
```

| Script | What it does |
| --- | --- |
| `dev` / `start` | `tsx watch src/server.ts` / `tsx src/server.ts` (there is no `build`: tsx runs the TypeScript directly) |
| `test` | `tsc -b` (all three projects), then `vitest run`; uses the `lumen_test` database only |
| `typecheck` | `tsc -b`: `tsconfig.app.json` (src), `tsconfig.test.json` (test), `tsconfig.scripts.json` (scripts, vitest.config.ts) |
| `lint` / `format` | `biome check .` / `biome format --write .` (root `biome.json`) |
| `clean` | removes `node_modules/.cache` (tsc build info) |
| `auth:migrate` | `tsx scripts/migrate.ts` |

The server refuses to start while `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DASHBOARD_ORIGIN`,
`INTERNAL_SECRET`, `RAG_SERVICE_URL`, `MODEL_KEY_ENCRYPTION_SECRET` (exactly 64 hex characters; changing it makes stored model keys unreadable), `MAX_DOCUMENTS_PER_TENANT`, `RATE_LIMIT_PER_MINUTE`, `MAX_REQUESTS_PER_MONTH` or `MAX_PROJECTS_PER_USER`
is missing. With `NODE_ENV=production` it also refuses to start without `SMTP_URL` and `MAIL_FROM`. Google/GitHub sign-in is skipped while its client id/secret are empty; email + password always works.

Other tunables live in `config.json` (ingest timeout, interrupted-ingest cutoff, global LLM cap per minute, upload
limit, page sizes). Each can be overridden by an upper-snake env var, for example `INGEST_TIMEOUT_MS`.

`globalLlmCapPerMinute` defaults to 8 (`GLOBAL_LLM_CAP_PER_MINUTE`). Groq documents base limits of 30 requests per
minute and 8K tokens per minute for `openai/gpt-oss-20b` and `openai/gpt-oss-120b`. One chat call uses roughly
700-1500 tokens, so tokens per minute, not requests, is the binding limit.

## Tenant models (Phase 3B)

`/api/dashboard/models` (session) manages a tenant's own provider models in two tiers, `cheap` and `expensive` (the fallback tier was removed; `tier: "fallback"` is a `422 invalid_request`; inside a tier models are tried top to bottom): list, add (Test & save makes one tiny
completion first and saves nothing on failure), move up/down within a tier, remove, optional per-1M-token prices,
and `/models/usage?range=7d|30d`. Keys are AES-256-GCM encrypted (bound to the tenant id), only a masked hint is
ever returned, and endpoint URLs go through `shared/lib/endpointGuard.ts` (https only, `http://localhost` outside
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

**Provider rate limits.** When every attempt of the chosen tier was rate limited, the Python service answers `429
provider_rate_limited` (an attempt may carry `retry_after_seconds`). `/v1/chat` and `/try` then answer
`429` with the header `Retry-After: <seconds>` and
`{ "error": { "code": "provider_rate_limited", "message": "The model provider is rate limiting this workspace. Try again in about 2 minutes.", "retry_after_seconds": 120 } }`.
The wait is read from the body, else the service's `Retry-After` header, and must be a whole number of seconds (capped at
one day); if neither is valid the call stays `502 provider_error`. The message is always built by Express from that number,
never relayed. The request is logged with `status: "provider_rate_limited"` (tier `null`, so Analytics counts it under
`failed` and Requests shows it like a `provider_error`; it still counts toward the monthly allowance), its `model_calls`
rows have outcome `rate_limited`, and the model's stored `rate_limits` keeps the `retry-after` header. Any other mix of
failures stays `502 provider_error`.
`GET /models/usage` (and Analytics `by_model`) add `rate_limited_until` per model: the ISO time
`rate_limits_seen_at + rate_limits["retry-after"]` (seconds) while that is still in the future, else `null`
(an HTTP-date `retry-after` also gives `null`).

With no models: production answers `422 no_models_configured`, other environments let the Python service use its
`LLM_*` default. The global LLM cap applies only to that shared default key.
The schema is the numbered SQL in `infra/sql/` (`pnpm db:migrate` from the repo root applies the pending files to the dev database; tests apply every file to `lumen_test` themselves). Design and reasons: `docs/DATABASE.md`. Upgrading drops `request_logs.tokens_in`, `tokens_out` and `cost_usd` without carrying them over: requests that have no `model_calls` rows (logged before the table existed) show null tokens and cost afterwards. `pnpm --filter @lumen/api auth:migrate` also enables RLS on Better Auth's tables (`infra/sql/auth/001_auth_tables_rls.sql`). In short: every tenant table points at `tenants(id)` with `ON DELETE CASCADE`; a request's sources are `request_sources` rows; chunk counts and a request's tokens and cost are the views `document_stats` and `request_usage`, not stored columns.

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
                 "rate_limits": null, "rate_limits_seen_at": null, "rate_limited_until": null, "requests": 4, "tokens_in": 300, "tokens_out": 30,
                 "failures": { "error": 1, "timeout": 1, "rate_limited": 0 }, "backup_uses": 0,
                 "median_latency_ms": 200, "cost_usd": 0.003 }]
}
```

`escalated` is tier `expensive` with `escalated: true` (the router was cautious); `expensive_hard` is tier `expensive`
without it. Latency covers answered requests only (`status = ok`). `per_day[].cost_usd` and `total_cost_usd` sum
`request_usage.cost_usd` (the sum of the request's `model_calls.cost_usd`; null when nothing in the period was priced). `by_model` is exactly the `models` array of
`GET /models/usage` for the same range (unused models included, `cost_usd` per model).

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
(re-ingested) has `chunk_id: null`, its `filename` and `passage: null`; a source whose document is gone has `document_id: null`,
`chunk_id: null` and `document_deleted: true` (show "deleted document"). Source ids that were not this tenant's documents or chunks
when the request was logged are stored as unknown (`null`) the same way. Tokens and cost are the sum over the request's `model_calls`. Failed requests have `route.tier: null` and `status: "provider_error"` or `"provider_rate_limited"`.

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

## Accounts, verification and projects (Phase 4B-1)

### Environment

| Variable | Meaning |
| --- | --- |
| `MAX_PROJECTS_PER_USER` | Required. How many projects (organizations) one user may own. The next one is `422 project_limit`. Counts owned projects only, not ones the user was added to |
| `SMTP_URL` | Optional in development, **required in production** (the API refuses to start without it). An nodemailer connection URL such as `smtps://user:pass@smtp.example.com:465`. Never logged |
| `MAIL_FROM` | Sender address, for example `Lumen <no-reply@example.com>`. Required in production; defaults to `Lumen <no-reply@localhost>` elsewhere |

With `SMTP_URL` empty and `NODE_ENV=development`, the verification email is **not sent**: the API log prints it
(`mail not sent (no SMTP_URL, development): open the link below`, with the link in the `text` field). With `SMTP_URL`
empty in any other environment nothing is sent and no link is logged. New tunables in `config.json` (env-overridable):
`projectNameMaxChars` (60), `projectDescriptionMaxChars` (500), `verificationResendWindowSeconds` (60),
`verificationResendMax` (3), `verificationEmailExpiresSeconds` (3600), `verificationResendPerEmailWindowSeconds` (3600),
`verificationResendPerEmailMax` (5), `dbConnectionTimeoutMs` (5000: a starved database pool errors after this long instead of hanging),
`projectIdMaxChars` (100), `projectSlugMaxChars` (30), `projectSlugRandomBytes` (3), `projectCreateLockMs` (15000).

`TRUST_PROXY` (optional, **off by default**): how Express reads the client address behind a reverse proxy. Unset, empty, `false` or `0` = ignore
`X-Forwarded-For`, the right choice with no proxy (a client could otherwise pick its own address and dodge every per-address limit). A number is the count of
proxy hops in front of the API (`1` for one load balancer); a list such as `loopback, 10.0.0.0/8` names trusted proxies. `true` is refused. Behind a
proxy with the default, every client shares one per-address counter, so set it there.

### Email verification (email + password accounts)

- `signUp.email` creates the user **unverified** and starts **no session** (`data.token` is `null`). A verification email is sent.
  Signing up with an address that already exists returns the same success shape (no enumeration).
- `signIn.email` for an unverified user fails with **HTTP 403, `error.code: "EMAIL_NOT_VERIFIED"`** and sends a fresh email.
- The email contains `${BETTER_AUTH_URL}/api/auth/verify-email?token=...&callbackURL=...`. The `callbackURL` is always forced to
  `${DASHBOARD_ORIGIN}/verify-email?status=verified`, whatever the client sent. The browser lands on:
  - success: `/verify-email?status=verified` (the first click also signs the user in; the session cookie is set on the API origin)
  - failure: `/verify-email?status=verified&error=<CODE>`. **If `error` is present it is a failure and `status` must be ignored.** Codes:
    `TOKEN_EXPIRED` (older than `verificationEmailExpiresSeconds`), `INVALID_TOKEN` (tampered or malformed), `USER_NOT_FOUND`.
- "Works once": the link is a signed token, so it cannot be revoked, but it is idempotent. Once the user is verified, another click only
  redirects to `status=verified` again: no new session, nothing changes.
- Resend: `POST /api/auth/send-verification-email`, at most `verificationResendMax` per `verificationResendWindowSeconds` per client
  address (the socket address Express sees; see `TRUST_PROXY` below). On top of that, at most `verificationResendPerEmailMax` verification
  emails go to one address per `verificationResendPerEmailWindowSeconds`, counted across sign-up, unverified sign-in and resend, from any number of
  clients. Over that limit the mail is dropped silently and the response is identical for every address, so a victim's inbox cannot be flooded and nothing
  can be enumerated. Over the limit: `429 { error: { code: "rate_limited" } }`.
  The response is the same for unknown and already-verified addresses and no mail is sent for them.

```ts
await authClient.signUp.email({ email, password, name, callbackURL: `${location.origin}/verify-email` }); // no session; show "check your email"
const { error } = await authClient.signIn.email({ email, password });
if (error?.code === "EMAIL_NOT_VERIFIED") { /* offer Resend; a new email was already sent */ }
await authClient.sendVerificationEmail({ email, callbackURL: `${location.origin}/verify-email` });      // Resend; error.status === 429 when throttled
```

(`callbackURL` is only needed to pass Better Auth's origin check; the API overrides where the link lands.)

### Linking Google and GitHub (no implicit linking)

`account.accountLinking.disableImplicitLinking` is on. Signing in with a provider whose email matches an existing user does **not**
link and does not sign in: the browser redirect flow returns to the error callback with `?error=account_not_linked` (the id-token API
answers `401 { message: "account not linked", code: "OAUTH_LINK_ERROR" }`). A brand-new email can still sign up with a provider, and
a provider sign-up needs no verification email. A signed-in user links a provider explicitly, even if the provider's email differs
from the account email (`allowDifferentEmails`); the provider account of another user cannot be taken over.

```ts
await authClient.signIn.social({ provider: "google", callbackURL: `${origin}/projects`, errorCallbackURL: `${origin}/sign-in` }); // errors land on /sign-in?error=account_not_linked
await authClient.linkSocial({ provider: "github", callbackURL: `${origin}/account` });   // signed in; redirects to the provider and back
const { data: accounts } = await authClient.listAccounts();                              // [{ providerId: "credential" | "google" | "github", ... }], no tokens
```

Not exercised by tests: the real browser redirect round trip with Google or GitHub (tests use a fake provider through the id-token path,
which runs the same linking rules).

### Account (`GET /api/dashboard/account`)

Session only; no active project needed. Returns only the caller's own data (no id is read from the request); `401` without a session.

```json
{
  "user": { "name": "Ada", "email": "ada@example.com", "email_verified": true, "image": null, "created_at": "2026-10-01T08:00:00.000Z" },
  "providers": [{ "provider": "email", "linked_at": "2026-10-01T08:00:00.000Z" }, { "provider": "google", "linked_at": "2026-10-05T09:30:00.000Z" }],
  "projects": { "owned": 2, "max": 5 },
  "totals": { "documents": 12, "requests_this_month": 340, "api_keys": 3, "models": 4 }
}
```

`providers` come from Better Auth's `account` rows (`credential` is shown as `email`); tokens, password hashes and provider account ids are never returned.
`projects.owned` counts projects where the user is owner; `max` is `MAX_PROJECTS_PER_USER`. `totals` are summed over every project the user is a member of
(`requests_this_month` is the calendar month in UTC, like `GET /usage`).

### Projects (`/api/dashboard/workspaces`)

Creating a project is serialised per user inside Better Auth's create hook (an in-process lock, no database connection held while waiting), so
`POST /workspaces` and the client's own `organization.create` share one exact cap even under concurrent calls. The lock is per API process; with several
instances a database-level guard would be needed. Upload files are stored as `<tenantId>__<uuid>` and removed after a project is deleted; a chat or
ingest still running for a deleted project writes nothing (the `tenants` row is locked by the delete, so the late write waits, then finds no tenant: a chat or attempt insert writes no row, any other insert fails the foreign key).

A project is a Better Auth organization and is the tenant. Better Auth's `afterCreateOrganization` hook inserts the `tenants` row (`ON CONFLICT DO NOTHING`), for the default project too. The description is `organization.metadata.description`.
The routes below need a session but **not** an active project. Every other `/api/dashboard/*` route needs one and answers
`403 no_active_project` ("Choose a project first.") when the session has none or the user is no longer a member of it
(for example after deleting it); the web app then sends the user to `/projects`.

| Endpoint | Behaviour |
| --- | --- |
| `GET /workspaces` | every project the user belongs to, oldest first |
| `POST /workspaces` `{ name, description? }` | `201 { workspace }`. Name 1 to `projectNameMaxChars`, description up to `projectDescriptionMaxChars`; the slug is generated (`shop-support-3fa9c1`); the creator is owner; the active project is **not** changed. `422 project_limit` at `MAX_PROJECTS_PER_USER` owned projects |
| `PATCH /workspaces/:id` `{ name?, description? }` | owner or admin (`403 forbidden` for a member); `description: null` clears it. `200 { workspace }` |
| `DELETE /workspaces/:id` `{ name }` | owner only (`403 forbidden`); the body must repeat the project's exact name (`422 name_mismatch`). One transaction deletes the `tenants` row (the cascade removes `documents`, `chunks`, `request_logs`, `request_sources`, `tenant_models`, `model_calls`), the project's API keys, invitations, members, clears it as any session's active project, then deletes the organization. `204`. All or nothing; the project's leftover upload files are removed after the commit |

Another user's project id, an unknown id and a malformed id are all `404 not_found`. Validation errors are `422 invalid_request`.

```json
{ "workspaces": [{
  "id": "k3V...", "name": "My project", "slug": "personal-<userId>", "description": null,
  "role": "owner", "created_at": "2026-10-24T08:00:00.000Z", "documents": 2, "requests_this_month": 14
}] }
```

`requests_this_month` is the calendar month in UTC, the same boundary as `GET /usage`.

Rules enforced inside Better Auth itself, so they hold for the client's own calls too: `organization.create` is capped by
`MAX_PROJECTS_PER_USER` (`422`, `code: "PROJECT_LIMIT"`), and `organization.delete` is refused (`403`, `USE_WORKSPACE_DELETE`) because it
would leave the tenant's data behind. Use `DELETE /workspaces/:id`.

Every new user, whichever way they sign up, gets one default project named "My project" (renamable, deletable). A user who deleted
all projects gets a new default one at their next sign-in, so a signed-in user is never without a tenant at sign-in time.

```ts
await authClient.organization.setActive({ organizationId });   // activates a project (the web "enter project" step); 403 if not a member,
                                                               // and Better Auth then clears the active project (tenant routes answer 403 no_active_project)
await authClient.getSession({ query: { disableCookieCache: true } }); // re-read session.activeOrganizationId after switching; clear cached query data
await authClient.organization.list();                          // same projects without counts; prefer GET /workspaces
// create / rename / delete: fetch(`${API}/api/dashboard/workspaces`, { method: "POST", credentials: "include", ... }) as above
```

### Dev-only helpers

`POST /dev/verify-email` `{ email }` with the `x-internal-secret` header (mounted with `/dev/api-key`, only when `NODE_ENV=development`)
marks an email + password user's address verified (`204`), so e2e runs can sign up and sign in without a mailbox.
`/dev/api-key` is unchanged and does not need a verified user. Test helpers: `createTenant` in `test/helpers/ctx.ts` marks the new user verified;
`ctx.mails` captures every email the app tried to send (a fake transport).

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

```text
.env.example         every variable, empty; copy to .env
config.json          tunable defaults (overridable by env vars)
tsconfig.json        references only; tsconfig.app / test / scripts extend ../../tsconfig.base.json
scripts/migrate.ts   `auth:migrate`, creates/updates Better Auth's tables
src/
  server.ts          entry: load .env and config, start listening, run the startup ingest sweep
  app.ts             builds the Express app, mounts middleware and routes
  modules/<feature>/ code used by one feature
    auth/            auth.ts (Better Auth setup), mailer.ts, windowCounter.ts, keyedLock.ts
    chat/ documents/ feedback/ models/ projects/ analytics/ requests/ usage/ dev/
                     <feature>.routes.ts, plus documents/sweep.ts and models/provider.ts
  shared/            code used by two or more features
    config/          config.ts (env + config.json -> Config), env.ts (loads apps/api/.env)
    db/              pool.ts
    middleware/      rateLimit, requireApiKey, requireSession, tenantModels
    lib/             errors (error shape), range (7d/30d, UTC month), crypto (AES-256-GCM), endpointGuard (SSRF guard), logger (key redaction), uploads
    services/        rag.ts (rag-service client), modelCalls.ts (attempts, cost), modelUsage.ts, projects.ts
    types/           types.ts (Deps, Express request fields)
test/                mirrors src: modules/<feature>/, shared/, dashboardCors.test.ts (app level); helpers/ and global-setup.ts
```
