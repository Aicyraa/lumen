# Deploying Lumen

`web` on Vercel, `api` and `rag-service` as Docker containers on Render (Blueprint `render.yaml` at the repo root), Postgres on Supabase. Nothing here was deployed: the images were built and run locally and `render.yaml` was checked against Render's published JSON schema only (section 9 says exactly what was and was not checked). The images are plain Docker images, so another host works with the same variables (section 10 says what changes).

```text
Browser ──https──> https://NAME.vercel.app            (Vercel: static web + rewrites)
                      │  /api/*  /v1/*  proxied (vercel.json rewrites), everything else = index.html
                      ▼
              https://lumen-api.onrender.com          (Render web service: apps/api, PORT 10000, PUBLIC)
                      │  X-Internal-Secret, Render private network only
                      ▼
              http://lumen-rag-xxxx:8000              (Render private service: apps/rag-service, no public URL)
                      │
API and rag ───────> Supabase Postgres (session pooler or direct, never port 6543)
API ───────────────> SMTP provider (verification emails)      rag ──> tenants' LLM providers (their own keys)
```

## 1. Images

| Image | Build (run from the repo root) | Size | Build time |
| --- | --- | --- | --- |
| api | `docker build -f apps/api/Dockerfile -t lumen-api .` (context = repo root: pnpm workspace and `infra/sql`; ignore list `apps/api/Dockerfile.dockerignore`) | 520 MB | about 45 s cold |
| rag-service | `docker build -t lumen-rag apps/rag-service` (context = the app dir, ignore list `.dockerignore`) | 1.74 GB (CPU torch 0.9 GB, other Python packages 0.5 GB, the two models 0.19 GB) | 3 min 23 s cold, 39 s when only `app/` changed |

Measured with Podman 5.8 using `--format docker` (Podman's default OCI format drops `HEALTHCHECK`; Docker/BuildKit keeps it). Render ignores the image's `HEALTHCHECK` (it uses its own: HTTP `healthCheckPath` for web services, a TCP probe for private services), so the Podman note only matters for other hosts.

- **api**: runs `node --import tsx src/server.ts` (the repo has no compiled build; tsx is a devDependency, so dev dependencies are installed), as user `node`, `NODE_ENV=production`, `PORT=3000` (the Blueprint pins `PORT=10000`, Render's default for web services; the app reads `PORT`, so any value works). Health check: `GET /api/auth/ok` (Better Auth's built-in; the API has no health route of its own).
- **uploads**: files in `apps/api/uploads` are scratch. Each upload is deleted as soon as its ingest ends and the startup sweep deletes leftovers; chunks live in Postgres. **No volume is needed.** Without one, a restart loses only ingests running at that moment (the sweep marks them `failed`, the user uploads again), exactly as with a volume. If you mount a volume anyway (`/app/apps/api/uploads`), it must be writable by uid 1000; a fresh volume is usually root-owned and uploads would fail with 500. (Render cannot attach a disk to a free service anyway.)
- **rag-service**: CPU-only torch (CI does the same), dependencies pinned by `constraints.txt`, models baked in by `python -m app.cli download-models` at the pinned revisions of `app/config.yaml`. At runtime `HF_HUB_OFFLINE=1` and the code loads with `local_files_only=True`, so the container never contacts Hugging Face and needs no model volume. Non-root (uid 10001), start command `python -m app.cli serve`, health check `GET /internal/health` (no secret). To change a model: edit `config.yaml`, rebuild (a new embedding model also needs `VECTOR(384)` and a re-embed).
- **Why `RAG_HOST=0.0.0.0` in the image**: inside a container `127.0.0.1` is unreachable from the platform's private network, so the service would be unreachable by the API. The CLI default stays `127.0.0.1` for bare-metal. The service is private because on Render it is a *private service* (`type: pserv`): no public URL, reachable only from your other services in the same region and workspace. Anyone who can reach it still needs `INTERNAL_SECRET` for every route except `/internal/health`. Render's private network also reaches the service on its detected port (8000), so no `RAG_PORT`/`PORT` override is needed.
- The torch version is not pinned (CI does not pin it either): a rebuild may pick a newer CPU wheel. Build used torch 2.14.1+cpu.

## 2. Environment variables

Names come from `apps/api/src/shared/config/config.ts`, `apps/rag-service/app/core/config.py` and the `.env.example` files. Set them as the host's secrets, not in the image. Never put real values in git.

**api** (starts only when all "required" ones are set and valid)

| Variable | Required | Production value |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` (the image and the Blueprint set it; unset or any other word counts as production, `development` opens `/dev/*` routes: never in production) |
| `DATABASE_URL` | yes | Supabase session pooler or direct string (section 6) |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters (`openssl rand -hex 32`). The Blueprint uses `generateValue` (a random base64 256-bit value, 44 characters), created once and kept on later syncs |
| `BETTER_AUTH_URL` | yes | **`https://NAME.vercel.app`** (the browser-facing origin, not the API host; section 4) |
| `DASHBOARD_ORIGIN` | yes | **`https://NAME.vercel.app`**, exact, no trailing slash (CORS, Better Auth `trustedOrigins`, verification redirect). This is the brief's "web origin" |
| `INTERNAL_SECRET` | yes | long random string, **equal to rag-service's**. The Blueprint generates it once in the environment group `lumen-shared`, which both services link, so there is nothing to copy |
| `RAG_SERVICE_URL` | yes | the rag-service's private address. On Render the Blueprint fills it with `fromService ... property: hostport` (e.g. `lumen-rag-ab12:8000`, no scheme); the API adds `http://` when the value has no scheme (the private network is plain HTTP). Any other host: a full `http://...:8000` URL |
| `MODEL_KEY_ENCRYPTION_SECRET` | yes | exactly 64 hex chars (`openssl rand -hex 32`). Back it up: losing or changing it makes every stored provider key unreadable |
| `MAX_DOCUMENTS_PER_TENANT`, `RATE_LIMIT_PER_MINUTE`, `MAX_REQUESTS_PER_MONTH`, `MAX_PROJECTS_PER_USER` | yes | the human's limits |
| `SMTP_URL`, `MAIL_FROM` | yes in production | section 8 |
| `TRUST_PROXY` | recommended | `3` on Render behind the Vercel proxy (section 4); never `true` (refused) |
| `PORT` | no | default: the port of `BETTER_AUTH_URL`, else 3000. The Blueprint sets `10000`, Render's default for web services |
| `UPLOAD_MAX_BYTES` | no | default 10485760; lower it to `4194304` if the Vercel proxy rejects bigger bodies (section 4) |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | no | social sign-in; skipped while empty |
| other tunables | no | any key of `apps/api/config.json` as UPPER_SNAKE |

The Blueprint sets `NODE_ENV`, `PORT`, `TRUST_PROXY`, `RAG_SERVICE_URL`, `INTERNAL_SECRET`, `BETTER_AUTH_SECRET` and the four limits (50 / 60 / 5000 / 5: placeholders, edit them in `render.yaml` before the first deploy or in the dashboard afterwards) itself, and asks you for `DATABASE_URL`, `MODEL_KEY_ENCRYPTION_SECRET`, `BETTER_AUTH_URL`, `DASHBOARD_ORIGIN`, `SMTP_URL` and `MAIL_FROM` (`sync: false`). Social sign-in ids are not in the Blueprint: add them in the dashboard if you use them.

**rag-service**

| Variable | Required | Value |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` (set by the image; disables the `LLM_*` default model and `http://localhost` endpoints) |
| `DATABASE_URL` | yes | same database as the API; may differ in spelling (libpq syntax, section 6). Asked for by the Blueprint (`sync: false`) |
| `INTERNAL_SECRET` | yes | equal to the API's (environment group `lumen-shared`) |
| `RAG_HOST` / `RAG_PORT` / `RAG_WORKERS` | no | image sets `0.0.0.0` / `8000` / `1`. Keep workers at 1: each loads both models |
| `LOG_LEVEL` | no | `INFO` |

**web (Vercel project env, build time)**: `VITE_API_URL=/` (the single slash makes the app call its own origin; unset fails the build into a "Missing VITE_API_URL" screen on purpose).

**Single API instance.** Rate limit counters, the per-address and per-email resend limits, the create-project lock and background ingests are in memory, so run exactly one API instance (`apps/api/README.md`, "Running more than one API process"; the Blueprint sets `numInstances: 1`). A stopped or spun-down instance loses in-flight ingests and resets the counters (section 10 has what that means on Render's free plan). The rag-service can be restarted freely. During a deploy Render briefly runs the old and the new instance side by side (zero-downtime deploys: the old one gets SIGTERM 60 s after the new one is up), so two API processes overlap for about a minute; the sweep cutoff and its advisory lock cover that.

## 3. Deploy order

1. **Database.** On a **fresh** database apply Better Auth's tables, then `001`..`011`, to a session pooler/direct URL (a session lock is used, so not port 6543):

   ```sh
   export DATABASE_URL='postgresql://...'   # session pooler or direct, from your shell, never committed
   # auth:migrate builds the auth config, so it needs the API's required variables to exist; throwaway values are fine:
   env NODE_ENV=development BETTER_AUTH_SECRET=$(openssl rand -hex 16) BETTER_AUTH_URL=http://localhost:3000 DASHBOARD_ORIGIN=http://localhost \
     INTERNAL_SECRET=x RAG_SERVICE_URL=http://localhost:8000 MODEL_KEY_ENCRYPTION_SECRET=$(printf '0%.0s' $(seq 64)) \
     MAX_DOCUMENTS_PER_TENANT=1 RATE_LIMIT_PER_MINUTE=1 MAX_REQUESTS_PER_MONTH=1 MAX_PROJECTS_PER_USER=1 \
     pnpm --filter @lumen/api auth:migrate
   pnpm db:migrate      # applies infra/sql/001..011 in order, once each (table schema_migrations); pnpm db:status shows pending
   ```

   Verified on an empty `pgvector/pgvector:pg16`. **The Supabase project `lumen` is already migrated: all of `001`..`011` were applied through the Supabase tool, which does not write `schema_migrations`. Never run `pnpm db:migrate` there** (it would try to apply all eleven again and fail or, worse, partly re-run them). Nothing is left to do for the database; for a later migration `012`+ apply it with the Supabase tool as before (`docs/DATABASE.md`, `docs/NOTES.md`). Migrations are forward-only; take a backup first.
2. **Vercel project name.** Create the Vercel project first (Import Git repository, do not deploy yet, or deploy and ignore the result) so you know its real `https://NAME.vercel.app` (a name that is taken gets a suffix). You need it for `BETTER_AUTH_URL` and `DASHBOARD_ORIGIN`.
3. **rag-service and api on Render, from the Blueprint** (section 10). Both services are created together; the rag-service build is slow (a few minutes). Wait until the rag-service logs say it is up, then check the API (section 7).
4. **web** on Vercel. Put the API's real host, from the dashboard (`lumen-api.onrender.com`, or with a suffix if the name was taken), into `apps/web/vercel.json` (both `REPLACE-WITH-API-HOST`), commit, push, then deploy. Project settings:
   - Root Directory `apps/web`; keep "Include source files outside of the Root Directory in the Build Step" on (the default): the build reads the root `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `tsconfig.base.json`. Vercel then installs with pnpm from the repo root.
   - Framework Vite; build command `pnpm run build` and output `dist` (already in `vercel.json`); Node 24.x (`.nvmrc`; `engines` allows >=22).
   - Env `VITE_API_URL=/`.
5. Smoke test (section 7).

## 4. Primary setup: no custom domain, same-origin proxy

`vercel.app` is on the public suffix list, so a cookie set by `API_HOST` for a page on `NAME.vercel.app` is third-party: Better Auth's cookie is `SameSite=Lax` (verified in `better-auth@1.7.12` source), and a Lax cookie from a cross-site `fetch` response is rejected. Sign-in would return 200 and the next call would be 401. Making it `SameSite=None; Secure` needs code (`advanced.defaultCookieAttributes`) and is still blocked by Safari, Firefox and Brave. So the browser must only ever talk to the vercel.app origin, and `apps/web/vercel.json` rewrites `/api/*` and `/v1/*` to the API host *before* the SPA fallback. No change to `apps/api` is needed. Verified locally with a stand-in proxy (section 9).

Values that make it work:

| Setting | Value | Why |
| --- | --- | --- |
| web `VITE_API_URL` | `/` | requests are relative; the Better Auth client uses `window.location.origin` |
| api `BETTER_AUTH_URL` | `https://NAME.vercel.app` | `Secure` cookie flag is on because it starts with `https://`; verification links and OAuth redirect URIs point through the proxy, so the cookie lands on the vercel.app origin (first-party) |
| api `DASHBOARD_ORIGIN` | `https://NAME.vercel.app` | the browser sends `Origin: https://NAME.vercel.app`; Better Auth answers `403 INVALID_ORIGIN` for anything else |
| api `TRUST_PROXY` | `3` on Render | the app sees `X-Forwarded-For: visitor, <Vercel address>, <Cloudflare address>` with the Render load balancer as the socket peer, so the visitor is the third hop. Vercel sets the first entry to the visitor (replacing any client value); Render states that all inbound traffic passes through Cloudflare and Render's load balancers and that Cloudflare *appends* to `X-Forwarded-For`; that Render's own load balancer also appends is **assumed**, not documented, and the exact count is unverified (section 10 has a two-device test). Too low (`1` or `2`) and every visitor shares one address (the resend limit of 3/min becomes global); too high and the limit never triggers. Someone calling the API host directly can spoof their address for the per-address limits; that is low impact |
| Google/GitHub redirect URI | `https://NAME.vercel.app/api/auth/callback/google` (and `/github`) | the provider returns to the proxied path; not tested against real providers |

Limits of an external rewrite (from Vercel docs, checked 2026-10-26):

- **Timeout**: 120 s for every plan (`ROUTER_EXTERNAL_TARGET_ERROR` after that). The API's own limits are lower (`queryTimeoutMs` 60 s; ingest runs in the background after a `202`), so Try it and chat fit.
- **Request body size**: the docs state 4.5 MB for *Vercel Functions*; I found **no stated limit for external rewrites**, and no statement that the 4.5 MB applies to them. Whether a 10 MB upload passes is therefore **unverified**. If a 5-10 MB upload fails with 413 on vercel.app but works against the API host directly, the smallest fix is `UPLOAD_MAX_BYTES=4194304` on the API (an env override, no code). Server-to-server `POST /v1/documents` callers can use the API host directly and keep 10 MB.
- **Streaming**: not used; the API answers with plain JSON.
- **Headers**: Vercel forwards `x-forwarded-for`, `x-real-ip`, `x-forwarded-host`, `x-forwarded-proto`. The docs do not mention `Set-Cookie`, `Origin` or `Host` handling; Set-Cookie and Origin passing through is what the smoke test in section 7 checks. Responses carrying `Cache-Control` from the origin may be cached by Vercel's CDN: the API sends none for `/api`, but if you add any, make it `no-store`.
- Every request is billed to the Vercel project as an edge request; the public API host stays reachable directly (no origin lock). Optional hardening, not implemented: Vercel can add a secret header on every rewrite (`routes` transforms) and the API would reject requests without it.

## 5. Secondary setup: custom domain (recommended long term)

Web `https://app.example.com`, API `https://api.example.com`: same site, so no proxy is needed and the rewrites in `vercel.json` can be dropped. Set `VITE_API_URL=https://api.example.com`, api `BETTER_AUTH_URL=https://api.example.com`, `DASHBOARD_ORIGIN=https://app.example.com`, `TRUST_PROXY=2` on Render (Cloudflare and the load balancer, no Vercel; same assumption as section 4), OAuth redirect `https://api.example.com/api/auth/callback/google`. On Render a custom domain on the API service is added in the dashboard (not covered here). The cookie is host-only on `api.example.com`, `SameSite=Lax` and sent on the app's `credentials: "include"` calls because `app` and `api` are the same site; CORS allows exactly the `DASHBOARD_ORIGIN`. `crossSubDomainCookies` is not needed.

## 6. Supabase connection (pooler)

- Use the **session pooler** (port 5432 on the `*.pooler.supabase.com` host; works over IPv4) or the **direct** connection (IPv6 only unless the IPv4 add-on is on). **Not the transaction pooler (6543)**: psycopg prepares statements on the server after 5 uses (breaks under transaction pooling), the API takes session advisory locks (`pg_try_advisory_lock` in the startup sweep, `db:migrate`), and the rag-service sets a session-level `statement_timeout`. `docs/AI_BUILD_BRIEF.md` mentions 6543 for serverless; that does not apply here, both services are long-running.
- Pool sizes: the API's `pg.Pool` defaults to 10 and the rag-service pool to 10 per worker (`database.pool_max_size` in `config.yaml`), so up to about 20 session-pooler connections. The client limit of Supabase's session pooler depends on the plan; I did not verify it.
- TLS: `pg` treats `sslmode=require` as `verify-full`, which fails if the server's CA is not in Node's trust store. For the API use `...?uselibpqcompat=true&sslmode=require` (encrypts, no chain check) if plain `sslmode=require` fails with a certificate error. psycopg/libpq does not know `uselibpqcompat`, so the rag-service URL is `...?sslmode=require`. Not tested against Supabase here.
- Never put the `service_role` key anywhere; the services connect as the database owner and RLS stays on.

## 7. Smoke tests

```sh
APP=https://NAME.vercel.app ; API=https://lumen-api.onrender.com   # your real host; on the free plan the first call may take about a minute
curl -s  $API/api/auth/ok                                   # {"ok":true}  (api alive)
curl -s  $APP/api/auth/ok                                   # same through the proxy; HTML here = rewrite missing
curl -s  -o /dev/null -w '%{http_code}\n' $APP/projects     # 200, SPA fallback
# rag-service: private, so test it from its own Shell tab in the Render dashboard (the image has no curl; python is there; the secret stays in the container's environment):
#   python -c "import os,urllib.request as u; print(u.urlopen('http://127.0.0.1:8000/internal/health').read())"                                  # {"status":"ok"}
#   python -c "import os,urllib.request as u; print(u.urlopen(u.Request('http://127.0.0.1:8000/internal/ready',headers={'X-Internal-Secret':os.environ['INTERNAL_SECRET']})).read())"   # database and reranker both true
# (Shell may need a paid instance; otherwise read the logs and test the chain by uploading a document, below.)
# sign-up: the mail arrives only if SMTP works; click the link (it lands on NAME.vercel.app and signs you in)
curl -s -H "Origin: $APP" -H 'content-type: application/json' -X POST $APP/api/auth/sign-up/email \
  -d '{"email":"you@example.com","password":"a-long-password","name":"You","callbackURL":"'$APP'/verify-email"}'
# Set-Cookie check: sign in from the browser, DevTools > Application > Cookies: __Secure-better-auth.session_token on NAME.vercel.app
# upload + chat (create a project API key in the dashboard first; add a model in the Models tab for chat):
curl -s -H "x-api-key: $KEY" -F file=@handbook.md $APP/v1/documents          # 202 {document_id}; poll GET /v1/documents/{id} until ready
curl -s -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"query":"When do you open?"}' $APP/v1/chat
```

Without a model configured `/v1/chat` returns `422 no_models_configured`. Try a 6 MB and a 10 MB upload through `$APP` (section 4).

## 8. Email (`SMTP_URL`, `MAIL_FROM`)

Nodemailer accepts `smtp://` (plain start, then STARTTLS when the server offers it: use for port 587) and `smtps://` (TLS from the start: port 465). Checked in the nodemailer docs (Context7) and by parsing these URLs with the installed `nodemailer` (the port and `secure` flag came out as below). URL-encode special characters in the password. `?requireTLS=true` refuses to send if STARTTLS is not available.

| Provider | `SMTP_URL` | Notes |
| --- | --- | --- |
| Brevo | `smtp://LOGIN:KEY@smtp-relay.brevo.com:587?requireTLS=true` | `LOGIN` is the SMTP login shown in Brevo, `KEY` an SMTP key (not the account password); `MAIL_FROM` must be a verified sender |
| Resend | `smtps://resend:API_KEY@smtp.resend.com:465` | until a domain is verified it can only send to your own address; so verification mails to other people fail without a domain |
| Gmail | `smtps://user%40gmail.com:APP_PASSWORD@smtp.gmail.com:465` | app password (2-step verification on); testing only, low daily limits, `MAIL_FROM` is rewritten to the account |

Free-tier numbers of these providers change and were not verified. Without a domain, Brevo with a verified single sender is the practical option. `MAIL_FROM` example: `Lumen <you@example.com>`. A failed send is logged as `mail delivery failed` with the error code and never the URL.

## 9. Memory, verification status and rollback

**rag-service memory** (measured in the container, one worker): about 420 MB after start (both models loaded), 630 MB after ingesting a 4 KB file, **880 MB peak resident** while ingesting a 450 KB text (1,428 chunks); a query adds a reranker batch on top. Give it **2 GB** (1 GB will work for small documents and then be OOM-killed on big ones), 1-2 shared CPUs. Embedding is CPU-bound; the first request after a cold start is slower.

**Run locally (Podman, throwaway Postgres):** both images built; rag container healthy as non-root and offline, `/internal/ready` all true; api container healthy, SIGTERM stops it in under a second; migrations `auth:migrate` + `001..011` applied to an empty database; a built web (`VITE_API_URL=/`) behind a small Node proxy playing Vercel (same origin, `/api` and `/v1` forwarded with `X-Forwarded-*`): sign-up, verification link (built from `BETTER_AUTH_URL`), `Set-Cookie` first-party on the proxy origin, `get-session` and `/api/dashboard/*` authorized with that cookie, 401 without it, 403 `INVALID_ORIGIN` for a foreign origin, a document uploaded through the proxy ingested by the rag container (15 chunks). Web tests: 387 pass. The API accepts `RAG_SERVICE_URL=host:port` (unit test; the other API tests need the local test database and were not run). The API image still builds from a fresh worktree (Podman). `render.yaml` validates against Render's JSON schema (`https://render.com/schema/render.yaml.json`, checked with ajv 8; a deliberately wrong file is rejected). **Only written, never run**: the Blueprint itself on Render (Render's `blueprints validate` CLI needs an API key or login, so it was not used), Vercel's real rewrite behaviour (body size, Set-Cookie, Origin), HTTPS/`Secure` cookies, SMTP sending, OAuth with Google/GitHub, Supabase connections, `TRUST_PROXY=3` against the real Cloudflare/Render/Vercel chain, a chat call with a real model, the 1.7 GB image on Render's builder and registry.

**Rollback.** Web: Vercel dashboard, previous deployment, "Promote to Production" (or Instant Rollback). Containers: on Render, open the service's Deploys page, pick a recent successful deploy and click Rollback (it reuses that deploy's build artifact; a dashboard rollback also turns auto-deploys off, which the Blueprint already does). It only works while Render still keeps that build. Database: migrations are forward-only (no down scripts): restore from Supabase backup/PITR (plan-dependent), and keep each release compatible with the previous schema until you are sure. Keep `MODEL_KEY_ENCRYPTION_SECRET` and `BETTER_AUTH_SECRET` stable across rollbacks (changing the latter signs everyone out).

## 10. Render (Blueprint `render.yaml`)

`render.yaml` at the repo root describes two services in one region (singapore, the closest Render region to the Supabase project `lumen` in ap-northeast-2/Seoul; Render's regions are oregon, ohio, virginia, frankfurt and singapore; the region cannot be changed after creation, so edit it before the first deploy if you choose another, and keep both services in the same one, because the private network only spans one region):

| Service | Type | Built from | Plan in the file | Port |
| --- | --- | --- | --- | --- |
| `lumen-rag` | private service (`pserv`) | `apps/rag-service/Dockerfile`, context `apps/rag-service` | `1c-2g` (1 CPU, 2 GB) | 8000, private only |
| `lumen-api` | web service | `apps/api/Dockerfile`, context = repo root | `free` (512 MB, 0.1 CPU) | `PORT=10000`, public, health check `/api/auth/ok` |

Both have `numInstances: 1` and `autoDeployTrigger: "off"` (a push does not rebuild anything; you deploy by hand). One environment group, `lumen-shared`, holds the generated `INTERNAL_SECRET`, so both services get the same value. Check the file with `https://render.com/schema/render.yaml.json` (the YAML extension by Red Hat uses it from SchemaStore) or `render blueprints validate render.yaml` (needs the Render CLI and an API key, so it was not run here).

### Cost, honestly

- **The rag-service cannot run on the free plan.** There is no free private service, and a free web service has 512 MB; the rag-service measured 420 MB idle and 880 MB peak while ingesting (section 9). The cheapest plan with enough RAM is `1c-2g` (1 CPU, 2 GB; legacy name Standard), about **$25 per month**. `0.5c-512mb` (Starter, about $7) would be OOM-killed on the first large document.
- **The API can stay free** (`plan: free`, $0, 750 free instance hours per workspace and month, which one always-on service uses up almost entirely) or move to `0.5c-512mb` (about $7) for an always-on API. So the monthly bill is about **$25 with a free API, about $32 with a Starter API**. Build minutes beyond the plan's included amount (500 per month on Hobby) and outbound bandwidth are extra.
- The compute plans, their RAM and CPU come from Render's docs (`render.com/docs/compute-plans`). **The dollar figures are not from Render's own pages**: `render.com/pricing` did not render its table for me, so they come from third-party price lists and a Render-hosted mirror that agree with each other. Confirm them on the pricing page before you commit. Supabase and the SMTP provider are separate; Vercel Hobby is free.

### What a free API does (spin-down)

Render spins a free web service down after 15 minutes without inbound traffic and starts it again on the next request; the docs say that takes about a minute. Render may also restart a free service at any time. For Lumen this means:

- **The first request after idle waits about a minute** (sign-in page, API call, verification link). Vercel's external rewrites time out after 120 s, so the request still succeeds, but the first load looks hung. A ping every 10 minutes would keep it awake (the 750 free hours cover one service running all month), but that is working around the plan, not a setup.
- **In-memory state is lost at each spin-down or restart**: rate-limit counters, the per-address and per-email resend limits and the create-project lock restart from zero. The limits still protect against bursts but not across idle periods.
- **A background ingest running at that moment dies.** The startup sweep (`apps/api/src/modules/documents/sweep.ts`) marks documents still `processing` past its cutoff as `failed` at the next start and deletes leftover upload files; the user uploads again. Uploads are scratch space, nothing is lost beyond that run. Chunks already stored are in Postgres.
- Local files do not survive restarts (no disk on free services); that does not matter, there is no volume in this setup.
- The rag-service is a paid instance and does not spin down; its models are baked into the image, so a restart takes seconds, not a download. The API calls it over the private network: a free web service *can send* private requests, it just cannot receive them (Render docs, private network).
- To avoid all of the above, set `plan: 0.5c-512mb` on `lumen-api` in `render.yaml` (or change the plan in the dashboard). The API's memory was not measured; if 512 MB is too small, `1c-2g` is the next step.

### Steps you do in the Render dashboard

1. Push the branch that contains `render.yaml` (the Blueprint tracks whichever branch you pick) and make sure the repo is on GitHub, GitLab or Bitbucket. Create a Render account and workspace; Paid instances need a payment method.
2. Decide the Vercel URL (section 3, step 2), generate the two values you must bring: `openssl rand -hex 32` for `MODEL_KEY_ENCRYPTION_SECRET` (back it up) and an SMTP account (section 8). Have the Supabase session-pooler connection string ready (section 6).
3. Dashboard: **New > Blueprint**, connect the repository, choose the branch, keep the Blueprint path `render.yaml`, give the Blueprint a name.
4. Render shows the proposed services and asks for the `sync: false` values (asked once, at creation; later you change them on the service's Environment tab, and Render ignores `sync: false` variables on later Blueprint syncs):
   - `lumen-rag`: `DATABASE_URL` (`...?sslmode=require`).
   - `lumen-api`: `DATABASE_URL` (`...?uselibpqcompat=true&sslmode=require` if the plain form fails with a certificate error), `MODEL_KEY_ENCRYPTION_SECRET`, `BETTER_AUTH_URL` and `DASHBOARD_ORIGIN` (both `https://NAME.vercel.app`, no trailing slash), `SMTP_URL`, `MAIL_FROM`.
5. Check the proposed plans (rag `1c-2g`, api `free`) and region, then **Deploy Blueprint**. Builds start for both services; the rag image takes a few minutes (3 min 23 s cold locally; Render's builder has 2 CPUs and 8 GB, 120-minute timeout).
6. Open `lumen-api`: copy its URL (`https://lumen-api...onrender.com`). Open its **Environment** tab and look at `RAG_SERVICE_URL`: it should read like `lumen-rag-xxxx:8000`. If it shows another port or the API logs `connection refused`, open `lumen-rag`, copy its Service Address and set `RAG_SERVICE_URL` to `http://<service address>`.
7. Put the API host into both entries of `apps/web/vercel.json`, commit, push, deploy on Vercel (section 3, step 4).
8. Add social sign-in ids (`GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`) on the API's Environment tab if you use them; redirect URIs are in section 4.
9. Run the smoke tests (section 7) and the `TRUST_PROXY` check below.
10. To update: **Manual Deploy > Deploy latest commit** on each service (auto-deploy is off). Editing an environment variable in the dashboard redeploys that service by itself.

### Facts this setup relies on

From Render's docs (blueprint-spec, private-network, free, health-checks, web-services, build-pipeline, deploys, compute-plans): `dockerfilePath` and `dockerContext` are relative to the repo root; `generateValue` makes a random base64 256-bit value once; an environment group in `envVarGroups` can use `generateValue` and a service links it with `fromGroup`; `fromService` with `property: hostport` gives `host:port` of a private service, no scheme; health checks use `healthCheckPath` for web services and only a TCP check for private services; a check fails after 5 s without an answer and a deploy has 15 minutes to become healthy; services in the same region and workspace share a private network; the default `PORT` of a web service is 10000 and it must bind `0.0.0.0` (the API does, the image's rag default `RAG_HOST=0.0.0.0` too); web services accept responses up to 100 minutes (Render's own comparison pages), far above what the Vercel proxy allows.

**Assumed or unverified**: Docker is allowed on the free plan (the free page lists no runtime limit); the private service's detected port is 8000, so `hostport` resolves to it (step 6 is the fallback); Render's load balancer appends to `X-Forwarded-For` (see `TRUST_PROXY` below); the 1.7 GB image fits Render's registry and instance disk (no limit is documented in the pages I read); `Dockerfile.dockerignore` (BuildKit reads `<Dockerfile>.dockerignore`) is honoured by Render's builder, whose docs only mention `.dockerignore`; if it is not, the API build context is the whole git checkout, which is harmless but slower.

### Checking `TRUST_PROXY=3`

After the first deploy, from two different networks (for example your laptop and a phone on mobile data) post to `$APP/api/auth/send-verification-email` (a different email address each time, because a per-email limit also exists) more than three times a minute from one of them. The fourth call from that device must answer `429`, and the other device must still get through at that moment. If both are blocked together the value is too low: raise it. If the fourth call from one device is never blocked the value is too high: lower it. Set it on the API's Environment tab (a change redeploys the API).

### Other hosts

Fly.io, Railway, a VPS: the same images and variables. Differences to handle: the private URL (`RAG_SERVICE_URL` as a full `http://...:8000`; on Fly, `.internal` names resolve to IPv6 so the rag-service needs `RAG_HOST=::`), `PORT`, the health check, the `TRUST_PROXY` hop count, and never publishing the rag-service's port.

## 11. Open risks

1. Vercel rewrite behaviour for 10 MB bodies and Set-Cookie/Origin passthrough is not documented and was not run on Vercel; check with the smoke tests and fall back to `UPLOAD_MAX_BYTES=4194304`.
2. `TRUST_PROXY=3` is a hop-count assumption about Vercel, Cloudflare and Render's load balancer; test it (section 10).
3. Single API instance only; a crash or a free-plan spin-down loses running ingests until the next start's sweep.
4. The torch version is unpinned and the rag image is 1.7 GB; pin torch (or use a base image cache) if builds must be reproducible.
5. The API image installs dev dependencies (tsx lives there). Moving `tsx` to `dependencies` and installing with `--prod` would shrink the image (not measured); not done to leave `package.json` and the lockfile alone.
6. The API host stays public; the proxy is a convenience for cookies, not an access control.
