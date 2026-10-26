# Deploying Lumen

`web` on Vercel, `api` and `rag-service` as always-on containers on any Docker host, Postgres on Supabase. Nothing here was deployed: the images were built and run locally (section 9 says exactly what was and was not checked).

```text
Browser ──https──> https://NAME.vercel.app            (Vercel: static web + rewrites)
                      │  /api/*  /v1/*  proxied (vercel.json rewrites), everything else = index.html
                      ▼
              https://API_HOST                        (container 1: apps/api, port 3000, PUBLIC)
                      │  X-Internal-Secret, private network only
                      ▼
              http://RAG_HOST:8000                    (container 2: apps/rag-service, PRIVATE, no public port)
                      │
API and rag ───────> Supabase Postgres (session pooler or direct, never port 6543)
API ───────────────> SMTP provider (verification emails)      rag ──> tenants' LLM providers (their own keys)
```

## 1. Images

| Image | Build (run from the repo root) | Size | Build time |
| --- | --- | --- | --- |
| api | `docker build -f apps/api/Dockerfile -t lumen-api .` (context = repo root: pnpm workspace and `infra/sql`; ignore list `apps/api/Dockerfile.dockerignore`) | 520 MB | about 45 s cold |
| rag-service | `docker build -t lumen-rag apps/rag-service` (context = the app dir, ignore list `.dockerignore`) | 1.74 GB (CPU torch 0.9 GB, other Python packages 0.5 GB, the two models 0.19 GB) | 3 min 23 s cold, 39 s when only `app/` changed |

Measured with Podman 5.8 using `--format docker` (Podman's default OCI format drops `HEALTHCHECK`; Docker/BuildKit keeps it). Hosts that run their own health checks (Fly, Render, Railway) use their own setting anyway.

- **api**: runs `node --import tsx src/server.ts` (the repo has no compiled build; tsx is a devDependency, so dev dependencies are installed), as user `node`, `NODE_ENV=production`, `PORT=3000`. Health check: `GET /api/auth/ok` (Better Auth's built-in; the API has no health route of its own).
- **uploads**: files in `apps/api/uploads` are scratch. Each upload is deleted as soon as its ingest ends and the startup sweep deletes leftovers; chunks live in Postgres. **No volume is needed.** Without one, a restart loses only ingests running at that moment (the sweep marks them `failed`, the user uploads again), exactly as with a volume. If you mount a volume anyway (`/app/apps/api/uploads`), it must be writable by uid 1000; a fresh Fly volume is root-owned and uploads would fail with 500.
- **rag-service**: CPU-only torch (CI does the same), dependencies pinned by `constraints.txt`, models baked in by `python -m app.cli download-models` at the pinned revisions of `app/config.yaml`. At runtime `HF_HUB_OFFLINE=1` and the code loads with `local_files_only=True`, so the container never contacts Hugging Face and needs no model volume. Non-root (uid 10001), start command `python -m app.cli serve`, health check `GET /internal/health` (no secret). To change a model: edit `config.yaml`, rebuild (a new embedding model also needs `VECTOR(384)` and a re-embed).
- **Why `RAG_HOST=0.0.0.0` in the image**: inside a container `127.0.0.1` is unreachable from the platform's private network, so the service would be unreachable by the API. The CLI default stays `127.0.0.1` for bare-metal. The container is private because *you do not publish the port*: no public IP/port mapping, no public hostname. Anyone who can reach it still needs `INTERNAL_SECRET` for every route except `/internal/health`.
- The torch version is not pinned (CI does not pin it either): a rebuild may pick a newer CPU wheel. Build used torch 2.14.1+cpu.

## 2. Environment variables

Names come from `apps/api/src/shared/config/config.ts`, `apps/rag-service/app/core/config.py` and the `.env.example` files. Set them as the host's secrets, not in the image. Never put real values in git.

**api** (starts only when all "required" ones are set and valid)

| Variable | Required | Production value |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` (the image sets it; unset or any other word counts as production, `development` opens `/dev/*` routes: never in production) |
| `DATABASE_URL` | yes | Supabase session pooler or direct string (section 6) |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | yes | **`https://NAME.vercel.app`** (the browser-facing origin, not the API host; section 4) |
| `DASHBOARD_ORIGIN` | yes | **`https://NAME.vercel.app`**, exact, no trailing slash (CORS, Better Auth `trustedOrigins`, verification redirect). This is the brief's "web origin" |
| `INTERNAL_SECRET` | yes | long random string, **equal to rag-service's** |
| `RAG_SERVICE_URL` | yes | the rag-service's private URL, e.g. `http://lumen-rag.internal:8000` |
| `MODEL_KEY_ENCRYPTION_SECRET` | yes | exactly 64 hex chars (`openssl rand -hex 32`). Back it up: losing or changing it makes every stored provider key unreadable |
| `MAX_DOCUMENTS_PER_TENANT`, `RATE_LIMIT_PER_MINUTE`, `MAX_REQUESTS_PER_MONTH`, `MAX_PROJECTS_PER_USER` | yes | the human's limits |
| `SMTP_URL`, `MAIL_FROM` | yes in production | section 8 |
| `TRUST_PROXY` | recommended | `2` for the Vercel setup (section 4); never `true` (refused) |
| `PORT` | no | default 3000 (hosts that inject `PORT` just work) |
| `UPLOAD_MAX_BYTES` | no | default 10485760; lower it to `4194304` if the Vercel proxy rejects bigger bodies (section 4) |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | no | social sign-in; skipped while empty |
| other tunables | no | any key of `apps/api/config.json` as UPPER_SNAKE |

**rag-service**

| Variable | Required | Value |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` (set by the image; disables the `LLM_*` default model and `http://localhost` endpoints) |
| `DATABASE_URL` | yes | same database as the API; may differ in spelling (libpq syntax, section 6) |
| `INTERNAL_SECRET` | yes | equal to the API's |
| `RAG_HOST` / `RAG_PORT` / `RAG_WORKERS` | no | image sets `0.0.0.0` / `8000` / `1`. Keep workers at 1: each loads both models |
| `LOG_LEVEL` | no | `INFO` |

**web (Vercel project env, build time)**: `VITE_API_URL=/` (the single slash makes the app call its own origin; unset fails the build into a "Missing VITE_API_URL" screen on purpose).

**Single API instance.** Rate limit counters, the per-address and per-email resend limits, the create-project lock and background ingests are in memory, so run exactly one API machine (`apps/api/README.md`, "Running more than one API process"). Disable auto-stop/scale-to-zero (a stopped machine loses in-flight ingests). The rag-service can be restarted freely.

## 3. Deploy order

1. **Database.** Apply Better Auth's tables, then `001`..`011`, to a session pooler/direct URL (a session lock is used, so not port 6543):

   ```sh
   export DATABASE_URL='postgresql://...'   # session pooler or direct, from your shell, never committed
   # auth:migrate builds the auth config, so it needs the API's required variables to exist; throwaway values are fine:
   env NODE_ENV=development BETTER_AUTH_SECRET=$(openssl rand -hex 16) BETTER_AUTH_URL=http://localhost:3000 DASHBOARD_ORIGIN=http://localhost \
     INTERNAL_SECRET=x RAG_SERVICE_URL=http://localhost:8000 MODEL_KEY_ENCRYPTION_SECRET=$(printf '0%.0s' $(seq 64)) \
     MAX_DOCUMENTS_PER_TENANT=1 RATE_LIMIT_PER_MINUTE=1 MAX_REQUESTS_PER_MONTH=1 MAX_PROJECTS_PER_USER=1 \
     pnpm --filter @lumen/api auth:migrate
   pnpm db:migrate      # applies infra/sql/001..011 in order, once each (table schema_migrations); pnpm db:status shows pending
   ```

   Verified on an empty `pgvector/pgvector:pg16`. **The existing Supabase project `lumen` already has 001-009 applied through the Supabase migration tool, which does not write `schema_migrations`**: do not run `db:migrate` there; apply only `010` and `011` (see `docs/DATABASE.md`, `docs/NOTES.md`) with the Supabase tool. Migrations are forward-only; take a backup first.
2. **rag-service**, private. Wait for `/internal/ready` to say `ready`.
3. **api**, public. Set `BETTER_AUTH_URL`/`DASHBOARD_ORIGIN` to the Vercel URL, which you can choose before the first deploy (the project name fixes `NAME.vercel.app`).
4. **web** on Vercel. First put the API host into `apps/web/vercel.json` (both `REPLACE-WITH-API-HOST`), commit, then deploy. Project settings:
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
| api `TRUST_PROXY` | `2` | two proxies sit in front: Vercel (sets `X-Forwarded-For` to the visitor, replacing any client value) and the host's proxy (appends). With `1` every visitor appears as a Vercel address and the resend limit (3/min) becomes global; with off, as the host proxy. `2` assumes the host's proxy appends to `X-Forwarded-For` (typical proxies do): unverified here. Someone calling the API host directly can then spoof their address for the per-address limits; that is low impact |
| Google/GitHub redirect URI | `https://NAME.vercel.app/api/auth/callback/google` (and `/github`) | the provider returns to the proxied path; not tested against real providers |

Limits of an external rewrite (from Vercel docs, checked 2026-10-26):

- **Timeout**: 120 s for every plan (`ROUTER_EXTERNAL_TARGET_ERROR` after that). The API's own limits are lower (`queryTimeoutMs` 60 s; ingest runs in the background after a `202`), so Try it and chat fit.
- **Request body size**: the docs state 4.5 MB for *Vercel Functions*; I found **no stated limit for external rewrites**, and no statement that the 4.5 MB applies to them. Whether a 10 MB upload passes is therefore **unverified**. If a 5-10 MB upload fails with 413 on vercel.app but works against the API host directly, the smallest fix is `UPLOAD_MAX_BYTES=4194304` on the API (an env override, no code). Server-to-server `POST /v1/documents` callers can use the API host directly and keep 10 MB.
- **Streaming**: not used; the API answers with plain JSON.
- **Headers**: Vercel forwards `x-forwarded-for`, `x-real-ip`, `x-forwarded-host`, `x-forwarded-proto`. The docs do not mention `Set-Cookie`, `Origin` or `Host` handling; Set-Cookie and Origin passing through is what the smoke test in section 7 checks. Responses carrying `Cache-Control` from the origin may be cached by Vercel's CDN: the API sends none for `/api`, but if you add any, make it `no-store`.
- Every request is billed to the Vercel project as an edge request; the public API host stays reachable directly (no origin lock). Optional hardening, not implemented: Vercel can add a secret header on every rewrite (`routes` transforms) and the API would reject requests without it.

## 5. Secondary setup: custom domain (recommended long term)

Web `https://app.example.com`, API `https://api.example.com`: same site, so no proxy is needed and the rewrites in `vercel.json` can be dropped. Set `VITE_API_URL=https://api.example.com`, api `BETTER_AUTH_URL=https://api.example.com`, `DASHBOARD_ORIGIN=https://app.example.com`, `TRUST_PROXY=1`, OAuth redirect `https://api.example.com/api/auth/callback/google`. The cookie is host-only on `api.example.com`, `SameSite=Lax` and sent on the app's `credentials: "include"` calls because `app` and `api` are the same site; CORS allows exactly the `DASHBOARD_ORIGIN`. `crossSubDomainCookies` is not needed.

## 6. Supabase connection (pooler)

- Use the **session pooler** (port 5432 on the `*.pooler.supabase.com` host; works over IPv4) or the **direct** connection (IPv6 only unless the IPv4 add-on is on). **Not the transaction pooler (6543)**: psycopg prepares statements on the server after 5 uses (breaks under transaction pooling), the API takes session advisory locks (`pg_try_advisory_lock` in the startup sweep, `db:migrate`), and the rag-service sets a session-level `statement_timeout`. `docs/AI_BUILD_BRIEF.md` mentions 6543 for serverless; that does not apply here, both services are long-running.
- Pool sizes: the API's `pg.Pool` defaults to 10 and the rag-service pool to 10 per worker (`database.pool_max_size` in `config.yaml`), so up to about 20 session-pooler connections. The client limit of Supabase's session pooler depends on the plan; I did not verify it.
- TLS: `pg` treats `sslmode=require` as `verify-full`, which fails if the server's CA is not in Node's trust store. For the API use `...?uselibpqcompat=true&sslmode=require` (encrypts, no chain check) if plain `sslmode=require` fails with a certificate error. psycopg/libpq does not know `uselibpqcompat`, so the rag-service URL is `...?sslmode=require`. Not tested against Supabase here.
- Never put the `service_role` key anywhere; the services connect as the database owner and RLS stays on.

## 7. Smoke tests

```sh
APP=https://NAME.vercel.app ; API=https://API_HOST ; S='<INTERNAL_SECRET>'
curl -s  $API/api/auth/ok                                   # {"ok":true}  (api alive)
curl -s  $APP/api/auth/ok                                   # same through the proxy; HTML here = rewrite missing
curl -s  -o /dev/null -w '%{http_code}\n' $APP/projects     # 200, SPA fallback
# rag-service (from inside the private network, e.g. `fly ssh console -a lumen-api`):
curl -s  http://lumen-rag.internal:8000/internal/health                        # {"status":"ok"}
curl -s  -H "X-Internal-Secret: $S" http://lumen-rag.internal:8000/internal/ready   # database, embedder, reranker all true
curl -s  -o /dev/null -w '%{http_code}\n' http://lumen-rag.internal:8000/internal/ready   # 401 without the secret
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

**Run locally (Podman, throwaway Postgres):** both images built; rag container healthy as non-root and offline, `/internal/ready` all true; api container healthy, SIGTERM stops it in under a second; migrations `auth:migrate` + `001..011` applied to an empty database; a built web (`VITE_API_URL=/`) behind a small Node proxy playing Vercel (same origin, `/api` and `/v1` forwarded with `X-Forwarded-*`): sign-up, verification link (built from `BETTER_AUTH_URL`), `Set-Cookie` first-party on the proxy origin, `get-session` and `/api/dashboard/*` authorized with that cookie, 401 without it, 403 `INVALID_ORIGIN` for a foreign origin, a document uploaded through the proxy ingested by the rag container (15 chunks). Web tests: 387 pass. **Only written, never run**: the Fly.io config below, Vercel's real rewrite behaviour (body size, Set-Cookie, Origin), HTTPS/`Secure` cookies, SMTP sending, OAuth with Google/GitHub, Supabase connections, `TRUST_PROXY=2` against a real host proxy, a chat call with a real model.

**Rollback.** Web: Vercel dashboard, previous deployment, "Promote to Production" (or Instant Rollback). Containers: redeploy the previous image tag (`fly releases`, then `fly deploy --image registry.fly.io/lumen-api:deployment-<id>`); tag images by git commit so there is one to return to. Database: migrations are forward-only (no down scripts): restore from Supabase backup/PITR (plan-dependent), and keep each release compatible with the previous schema until you are sure. Keep `MODEL_KEY_ENCRYPTION_SECRET` and `BETTER_AUTH_SECRET` stable across rollbacks (changing the latter signs everyone out).

## 10. Worked example: Fly.io

Not run; check each flag against `fly help`. Two apps in one org, Fly Postgres not used. Run everything from the repo root. Put the files outside the app folders, for example `infra/fly/api.toml`:

```toml
# infra/fly/rag.toml  (private: no [http_service], no public IP)
app = "lumen-rag"
primary_region = "sin"
[env]
  RAG_HOST = "::"            # .internal resolves to IPv6 (6PN); "::" listens on IPv6 and IPv4. The image default 0.0.0.0 is IPv4 only
[[vm]]
  memory = "2gb"
  cpu_kind = "shared"
  cpus = 2
[checks.health]
  type = "http"
  port = 8000
  path = "/internal/health"
  interval = "30s"
  timeout = "5s"
  grace_period = "60s"
```

```toml
# infra/fly/api.toml
app = "lumen-api"
primary_region = "sin"
[env]
  BETTER_AUTH_URL = "https://NAME.vercel.app"
  DASHBOARD_ORIGIN = "https://NAME.vercel.app"
  RAG_SERVICE_URL = "http://lumen-rag.internal:8000"
  TRUST_PROXY = "2"
  MAX_DOCUMENTS_PER_TENANT = "50"       # your limits
  RATE_LIMIT_PER_MINUTE = "60"
  MAX_REQUESTS_PER_MONTH = "5000"
  MAX_PROJECTS_PER_USER = "5"
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"            # in-memory counters and background ingests
  auto_start_machines = false
  min_machines_running = 1              # exactly one machine: never `fly scale count 2`
  [[http_service.checks]]
    method = "GET"
    path = "/api/auth/ok"
    interval = "30s"
    timeout = "5s"
    grace_period = "30s"
    [http_service.checks.headers]
      X-Forwarded-For = "127.0.0.1"     # keeps Better Auth's rate limiter from logging a warning
[[vm]]
  memory = "512mb"
```

```sh
fly apps create lumen-rag ; fly apps create lumen-api
# secrets from a local file you do not commit (KEY=value lines); INTERNAL_SECRET must be identical in both
fly secrets import -a lumen-rag < rag.secrets      # DATABASE_URL, INTERNAL_SECRET, NODE_ENV=production
fly secrets import -a lumen-api < api.secrets      # DATABASE_URL, BETTER_AUTH_SECRET, INTERNAL_SECRET, MODEL_KEY_ENCRYPTION_SECRET, SMTP_URL, MAIL_FROM
fly deploy -c infra/fly/rag.toml -a lumen-rag --dockerfile apps/rag-service/Dockerfile --no-public-ips   # context: the app dir may need `fly deploy apps/rag-service`
fly deploy -c infra/fly/api.toml -a lumen-api --dockerfile apps/api/Dockerfile .
fly scale count 1 -a lumen-api
```

- Private networking: `lumen-rag.internal` is reachable only from your org's apps. The alternative is Flycast (`fly ips allocate-v6 --private -a lumen-rag`, then `http://lumen-rag.flycast:8000`), which needs an `[http_service]` section and an IPv4-listening process (the image default).
- API host: `https://lumen-api.fly.dev`; put it into both `REPLACE-WITH-API-HOST` entries of `apps/web/vercel.json`.
- Uploads: no volume. If you add one (`[mounts] source="uploads" destination="/app/apps/api/uploads"`), `chown 1000:1000` it first or uploads fail.
- Railway, Render or a VPS: same images, same variables; the private URL is `http://<service>.railway.internal:8000`, Render's private-service hostname, or a Docker network name. Bind rule is the same: no public port for the rag-service.

## 11. Open risks

1. Vercel rewrite behaviour for 10 MB bodies and Set-Cookie/Origin passthrough is not documented and was not run on Vercel; check with the smoke tests and fall back to `UPLOAD_MAX_BYTES=4194304`.
2. `TRUST_PROXY=2` is a hop-count assumption about the host's proxy.
3. Single API instance only; a crash loses running ingests until the next start's sweep.
4. The torch version is unpinned and the rag image is 1.7 GB; pin torch (or use a base image cache) if builds must be reproducible.
5. The API image installs dev dependencies (tsx lives there). Moving `tsx` to `dependencies` and installing with `--prod` would shrink the image (not measured); not done to leave `package.json` and the lockfile alone.
6. The API host stays public; the proxy is a convenience for cookies, not an access control.
