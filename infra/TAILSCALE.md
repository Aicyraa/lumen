# Running the rag-service on your machine behind a Tailscale Funnel

The rag-service needs about 1 GB of RAM, so it does not fit Render's free plan (512 MB). For a demo, run it on your own computer and let the Render-hosted api reach it through a Tailscale Funnel: a public HTTPS address that Tailscale forwards to `127.0.0.1:8000` on your machine.

```text
Browser -> Vercel (web) -> Render (api) --https, X-Internal-Secret--> https://MACHINE.TAILNET.ts.net
                                                                      (Tailscale Funnel, TLS ends on your PC)
                                                                          -> 127.0.0.1:8000 (rag-service) -> Supabase
```

What you should know first:

- Your computer must be on, awake and online while the demo is used. If it sleeps, uploads and questions fail (an upload in progress is marked failed).
- The address is public. The only protection on `/internal/*` is the secret `INTERNAL_SECRET`. Anyone who has it can read or delete any tenant's data through this service. Use 64 random hex characters and never commit it.
- TLS ends on your machine, so Tailscale's relay cannot read the traffic (Tailscale docs, "Funnel"). Funnel is documented as a beta feature with bandwidth limits you cannot configure.
- Only port 8000 is exposed, and only while the funnel runs. Stop it when you are done (step 9).

Everything below is checked against Tailscale's documentation but was not run on your machine.

## 1. Install Tailscale and sign in

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up          # opens a browser: sign in (a free personal account is enough)
tailscale version          # must be 1.38.3 or newer
```

## 2. Enable HTTPS in the admin console

Open <https://login.tailscale.com/admin/dns> and make sure **MagicDNS** is on and **HTTPS Certificates** is enabled. The first `tailscale funnel` run (step 6) also asks you to approve Funnel for your tailnet; follow the link it prints (this adds the `funnel` attribute to your access policy).

## 3. Get the Supabase connection string

Supabase dashboard -> your project `lumen` -> **Connect** -> **Session pooler** (port 5432). Copy the URI and add `?sslmode=require` at the end. Use the pooler, not the direct connection: the direct one is IPv6 only. Never use port 6543 (the transaction pooler breaks prepared statements and session settings).

## 4. Create `apps/rag-service/.env.funnel`

One `KEY=value` per line, no spaces around `=`, no quotes needed. The file is git-ignored.

```sh
cd apps/rag-service
printf 'DATABASE_URL=%s\nINTERNAL_SECRET=%s\n' 'PASTE-THE-SUPABASE-URI-HERE' "$(openssl rand -hex 32)" > .env.funnel
chmod 600 .env.funnel
```

Keep a copy of `INTERNAL_SECRET` in your password manager: you paste the same value into Render in step 8. To read it back: `grep '^INTERNAL_SECRET=' apps/rag-service/.env.funnel` (it prints the secret, so do it in a private terminal).

Optional lines: `RAG_PORT` (default 8000), `LOG_LEVEL`, `RAG_WORKERS` (default 1; every worker loads both models, so keep it at 1 unless you have the RAM).

The runner forces `NODE_ENV=production` and `RAG_HOST=127.0.0.1`, whatever the file says.

## 5. Check the file and start the service

```sh
pnpm rag:funnel -- --check      # validates the file, prints no value
pnpm rag:funnel                 # starts the service; leave this terminal open
```

In another terminal:

```sh
curl -s http://127.0.0.1:8000/internal/health      # {"status":"ok"}
```

## 6. Start the funnel

```sh
tailscale funnel --bg 8000
tailscale funnel status
```

`status` prints your public address, for example `https://my-pc.tail1234.ts.net`. The DNS record can take up to 10 minutes to appear. If the command asks you to enable Funnel, open the link it prints, approve, and run it again.

## 7. Check it from outside

```sh
URL=https://my-pc.tail1234.ts.net                                  # your address, no trailing slash
curl -s  $URL/internal/health                                      # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' $URL/internal/ready       # 401: the secret is required
curl -s -o /dev/null -w '%{http_code}\n' $URL/docs                 # 404: the interactive docs are off in production
read -rs INTERNAL_SECRET; export INTERNAL_SECRET                   # paste the secret, it is not echoed
curl -s -H "X-Internal-Secret: $INTERNAL_SECRET" $URL/internal/ready   # {"status":"ready",...}
```

## 8. Point the api at it

In the Render dashboard, service `lumen-api` -> Environment:

| Variable | Value |
|---|---|
| `RAG_SERVICE_URL` | `https://my-pc.tail1234.ts.net` (your address, no trailing slash, no port) |
| `INTERNAL_SECRET` | the same value as in `.env.funnel` |

Render redeploys when you save. When the Blueprint asks for these two values for the first time, enter them there instead.

## 9. Stop it

```sh
# Ctrl+C in the terminal running `pnpm rag:funnel`
tailscale funnel reset      # removes the public address
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `502` / empty reply from the public address | The service is not running on port 8000. Start `pnpm rag:funnel`. |
| The address does not resolve | DNS can take up to 10 minutes. Check `tailscale funnel status`. |
| Certificate errors right after setup | Let's Encrypt rate limits (Tailscale docs). Wait a few hours; do not keep resetting the funnel. |
| `/internal/ready` says `not_ready` | The database is unreachable or the models are still loading (about 30 s). Check the service terminal; check the Supabase string and `?sslmode=require`. |
| Uploads fail with "service unavailable" in the dashboard | The api cannot reach the funnel: wrong `RAG_SERVICE_URL`, funnel off, or the PC is asleep. |
| `401` from the api to the rag-service | `INTERNAL_SECRET` differs between Render and `.env.funnel`. |
| `pnpm rag:funnel` says `.venv` is missing | `pnpm --filter @lumen/rag-service bootstrap` (downloads the models, about 1 GB). |
