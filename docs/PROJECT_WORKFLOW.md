# Project workflow

## System overview

&#91;embedded content: system overview · 6 components\]

The dashboard and the customer's chatbot both talk only to Express. Express handles identity, keys, limits and logging, then calls the Python service, which owns chunking, embeddings, retrieval, routing and the model calls. Postgres holds both the platform tables and the vectors, and every vector row carries a `tenant_id`.

## Upload and chat, end to end

### Upload journey

&#91;embedded content: upload journey · 6 steps\]

Express checks the file and answers right away. Python does the slow work (extract the text, split it into chunks, turn each chunk into numbers, store them), and Express marks the document `ready` when Python finishes.

### Chat journey

&#91;embedded content: chat journey · 7 steps\]

The router first checks how well the best chunk matches the question (a strong keyword match can rescue a weak one), then decides the model tier and how many chunks (`k`) to fetch. Python finds candidates with keyword (BM25) and vector search fused by rank, reranks them with a local cross-encoder, sends the best passages to the chosen model, checks that every claim in the model's answer is backed by an exact quote from a passage, and writes the `[1]` citations itself. The answer travels back with its route and the tenant's estimated provider cost.

### How a document is stored in the vector database

&#91;embedded content: how a document is stored · 2 tables, example values\]

The values shown are examples. In the database:

- The file itself is not stored as a vector. Its text is cut into chunks, and each chunk becomes one row in `chunks`.
- Each `chunks` row holds three things: the chunk's text (`content`), its meaning as a list of numbers (`embedding`), and the owner (`tenant_id`).
- The `embedding` is the vector. It always has the same length (384 here, set by the embedding model and by `VECTOR(384)` in the table).
- A question is turned into numbers by the same embedding model, and pgvector returns the rows whose numbers are closest. The `content` of those rows is what goes into the prompt.
- `documents` holds one row per file, so you can show its status and delete the file. Deleting that row also deletes its chunks, because `chunks.document_id` points to it with a cascade.

## Onboarding and document upload flow

A new customer goes from the home page to a working API key and a searchable document set in these steps.

1. A visitor opens the public home page (no login). It shows how it works, a demo, a quickstart (cURL, Node, Python), security notes (the FAQ is postponed), plus /docs and /privacy pages. The savings calculator is on hold while pricing is reconsidered.
2. They click **Sign in with Google** or **Sign in with GitHub**. Better Auth runs the OAuth flow.
3. On first login Better Auth creates the `user` and sets the session cookie, and a hook creates a personal organization for them. That organization is the tenant.
4. In the dashboard they open **API keys** and create one with the API key plugin. It is shown once, stored only as a hash, and belongs to their organization.
5. They open **Documents** and upload a PDF or text file. Express checks file type, size and the tenant's document limit.
6. Express saves the file, creates a document record with status `processing`, and sends the file to `POST /internal/ingest` on the Python service.
7. Python extracts the text, chunks it, embeds the chunks and writes them to pgvector with the `tenant_id`.
8. Python returns the chunk count. Express sets the status to `ready`, or to `failed` with a reason the user can read.
9. The dashboard shows the status and a **Try it** box so the owner can ask a test question before touching any code.
10. The customer's own chatbot backend now calls `POST /v1/chat` with the API key.
11. Each call appears in the dashboard's **Requests** page, where the owner can open one to see its route, tokens and which documents it used (plus its estimated provider cost, from the prices the owner enters per model). The sidebar usage meters show how close the tenant is to its limits (documents, requests per minute, requests this month).

Ingest can take seconds to minutes on big files, so step 6 must not block. Return immediately with `processing`, run the ingest in the background, and let the dashboard poll the status.

## Auth and sessions

There are four kinds of callers, and each proves who it is in a different way. Keep them separate in your routes.

| Caller | How it proves identity | Routes |
| --- | --- | --- |
| Visitor on the home page | Nothing needed | `/`, `/docs` (public); `/pricing` only once Phase 7 adds it |
| Business owner in the dashboard | Google or GitHub login through Better Auth, then a session cookie | `/dashboard/*` and `/api/dashboard/*` (Better Auth itself lives at `/api/auth/*`) |
| Customer's chatbot backend | API key in the `x-api-key` header, verified with the API key plugin | `/v1/chat`, `/v1/documents` |
| Express calling Python | `X-Internal-Secret` header | `/internal/*` (never public) |

**Login flow (Better Auth with Express)**

1. In the React dashboard the user clicks **Sign in with Google**, which calls `authClient.signIn.social({ provider: "google" })`.
2. Better Auth redirects to Google. The user approves and Google redirects back to Better Auth's callback under `/api/auth/`.
3. Better Auth finds or creates the user and sets a session cookie. Sessions are stored in your Postgres database.
4. On a user's first login, a Better Auth `databaseHooks` hook creates a personal organization for them with the organization plugin, and the session's active organization is set to it. That organization is the tenant, and its id is the `tenant_id` used in every other table.
5. The browser lands on `/dashboard`. Dashboard routes in Express call `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` and reject the request when there is no session. The session's active organization says which tenant the request belongs to.
6. GitHub works the same way with `provider: "github"`.

**Docs for this part:** [Better Auth installation](https://better-auth.com/docs/installation), [Express integration](https://better-auth.com/docs/integrations/express), [Organization plugin](https://better-auth.com/docs/plugins/organization) and [API Key plugin](https://better-auth.com/docs/plugins/api-key). The Express page warns that mounting `express.json()` before the Better Auth handler makes requests hang, which is the most common setup mistake. Checked on 2026-10-21, when the docs listed version 1.7.12.

## Analytics console

The console is only as good as what you log. Log one row per request in a `request_logs` table, written by Express after the Python service answers.

**Dashboard views, each built from that one table**

| View | Built from | Why the owner cares |
| --- | --- | --- |
| Requests per day | `created_at` | Is the chatbot being used |
| Estimated provider cost per day and per model (tenant-entered prices); savings estimates are on hold | `cost_usd`, `tokens_in`, `tokens_out` | The headline number: what routing saved versus always using the expensive model. Mark it as an estimate. Not built until Phase 7 |
| Route mix | `model_tier`, `escalated` | How often the cheap path is enough |
| Latency | `latency_ms` | Median and slow requests |
| Unanswered questions | `top_score`, `model_tier`, cited sources | Two sections that tell the owner which documents to add: No match (weak best-match score or no model called) and Not found (a model ran but the answer cited no sources) |
| Feedback | `feedback` | Where answers disappoint users |
| Requests (log and detail) | Every column, plus `sources` joined to `documents.filename` | Lets the owner check one answer: which tier, how many tokens, which files it came from (and, from Phase 7, what it cost) |
| Usage meters | Counts on `documents` and `request_logs`, limits from environment variables | Shows how close the tenant is to its limits |

The Requests page and the usage meters need their own endpoints (`/api/dashboard/requests`, `/api/dashboard/requests/:id`, `/api/dashboard/usage`), all filtered by tenant. The log stores source ids and scores, not text. The filename comes from a join on `documents`, and that join also filters by `tenant_id`. The limits (documents, requests per minute, requests per month) are not decided yet: you choose them and set them in `.env`, and the numbers in the design mockups are placeholders.

**Privacy note:** queries can contain personal data, and never log full document text. A tenant-chosen retention period is not built yet. Until it is, no screen or page may promise one (the FAQ in the design says "You choose a retention period" and must be reworded). Decide the real retention policy before launch, not after.

## Tech stack: development and production

Use the development column to start. The production column is what you swap or add when real customers arrive. These are suggestions, not requirements, and package choices can change, so check each project's docs when you install.

| Layer | Development | Production upgrade |
| --- | --- | --- |
| Frontend | React with Vite, React Router, a charting library such as Recharts, TanStack Query for API calls, the Better Auth React client (`better-auth/react`) | Same code, built to static files and hosted on a static host or CDN |
| Backend (public) | Node.js LTS with ES modules, Express, `zod` (input validation), `multer` (uploads), `dotenv` | Add `helmet` (security headers), `express-rate-limit`, `cors` locked to your dashboard origin with credentials, `pino` (structured logs) |
| Auth and tenants | `better-auth` with Google and GitHub social providers, the `organization` plugin (tenants) and `@better-auth/api-key` (customer keys), using your Postgres database | Same, with HTTPS-only cookies, trusted origins set to your production domains, and secondary storage for API key lookups if traffic grows (the API key plugin supports it) |
| AI service | Python 3.11 or newer, FastAPI, `uvicorn`, `sentence-transformers`, `pypdf` (PDF text), `psycopg[binary]`, `pgvector`, `numpy`, `pydantic`, `pyyaml` | Run with several workers behind the same private network, add `tenacity` for provider retries |
| LLM providers | `openai` SDK pointed at an OpenAI-compatible endpoint, free tiers while testing | Paid tiers with spending caps, bring-your-own-key support (now in scope: Phase 3B and the Models tab) |
| Classifier (offline) | `scikit-learn`, `pandas`, a notebook | A saved model file loaded by `router.py`, retrained from logs on a schedule |
| Database | Postgres 16 with pgvector in Docker | Managed Postgres that supports pgvector (Neon and Supabase both do), backups on, HNSW index when needed |
| File storage | A local `uploads/` folder | An S3-compatible bucket (S3 or Cloudflare R2) |
| Background work | FastAPI background tasks | A job queue (BullMQ with Redis, or a jobs table in Postgres) once ingest gets slow |
| Containers | Docker Compose: express, rag-service, postgres | The same images on a container host such as Fly.io, Railway or Render, or a single VPS |
| Secrets | `.env` files kept out of git | The host's secret manager; rotate if one ever leaks |
| CI and tests | `pytest` for Python, Vitest and `supertest` for Express | GitHub Actions running tests and linters on every push |
| Monitoring | Console logs | Error tracking (for example Sentry), an uptime check, an alert on cost spikes |

## Models and hosting choices

The table and notes below describe the dev/test default models Lumen itself uses. In the product, each tenant adds its own cheap and expensive models and keys in the Models tab (`docs/WEBSITE_GUIDE.md`); Lumen supplies only the embedding model.

RAG uses two kinds of model. The embedding model turns text into vectors, for every chunk at upload and for every question at chat. It never writes answers. The chat models write the answers. You need one of the first and two of the second.

| Role | What it does | Suggested free choice |
| --- | --- | --- |
| Embedding model | Text to vectors, in both the upload and the chat journey | `all-MiniLM-L6-v2` (384 numbers, runs locally in the Python service), or Supabase's built-in `gte-small` (also 384 numbers) |
| Cheap chat model | Answers easy questions | Groq `llama-3.1-8b-instant` |
| Expensive chat model | Answers hard or uncertain questions | Groq `llama-3.3-70b-versatile` |

**Notes on the chat models** (checked on 2026-10-21, and free tiers change often)

- Groq's API is OpenAI-compatible: `LLM_BASE_URL=https://api.groq.com/openai/v1`. Model names change, so check Groq's models page before you pin them.
- Reported free limits (a third-party summary of Groq's docs): the 8B model gets 30 requests and 6,000 tokens a minute, the 70B model gets 30 requests and 12,000 tokens a minute. A RAG prompt with several chunks can use 1,000 to 2,000 tokens, so expect only a few requests a minute. Confirm live limits at `console.groq.com/settings/limits`.
- Free tiers are for development with test documents only. Never send real customers' private documents through them.
- Backup: Google's Gemini API free tier through its OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`), with a Flash-Lite model as cheap and a Flash model as expensive. Check AI Studio for current names and limits.
- Changing the embedding model means regenerating every stored vector. `gte-small` and `all-MiniLM-L6-v2` both give 384 numbers but are different models, so never mix them.

**Vercel and Supabase: what fits and what does not**

| Piece | Suggested home | What to watch |
| --- | --- | --- |
| React dashboard | Vercel | The Hobby plan is for personal, non-commercial use only. A paid product needs the Pro plan |
| Postgres + pgvector | Supabase | Enable the `vector` extension. See the connection and security notes below |
| Express API | A container host, or Vercel functions | On Vercel, a request body over 4.5 MB fails with a 413, and a function's default maximum duration is 10 s (up to 60 s on Hobby, 300 s on Pro) |
| Python RAG service | A container host such as Render, Railway or Fly.io, not Vercel | Vercel's Python bundle limit is 500 MB, and `sentence-transformers` pulls in PyTorch, which can be large. Test early with `vercel build`. Ingest is also slow work |

The simplest setup for you: React on Vercel, Express and Python together on one container host, Postgres on Supabase. That removes the 4.5 MB upload cap, the 10 s limit and the bundle limit. If Express stays on Vercel, uploads above 4.5 MB must go straight to storage (Vercel Blob or Supabase Storage) and Express passes on only a reference, and the 10 MB upload limit in the API contract must drop to about 4 MB.

**Supabase notes**

- Enable pgvector with `create extension if not exists vector;`. Supabase's examples use a `vector(384)` column for `gte-small`.
- Connections: from serverless code, use the transaction pooler (port 6543). From a long-running server, use the direct connection or the session pooler. The direct connection is IPv6 only, so use a pooler if your host needs IPv4. Supabase's Vercel guides also add `?workaround=supabase-pooler.vercel` to the pooler URL.
- Security: Supabase exposes tables in the `public` schema through its Data API by default, and a table without Row Level Security can be read by anyone holding the public key. Better Auth's tables (sessions, accounts) live in the same database. Because this project only uses direct Postgres connections, turn the Data API off, or enable Row Level Security on every table, including Better Auth's. Never put a `service_role` key in the browser.
- A vector index plus a `tenant_id` filter can return fewer rows than you asked for. Test it with your two-tenant isolation test.

## Project flow

Do the setup stage first, then build one phase at a time. The order is Python RAG service, then Express, then React, because the dashboard is built on the real API responses.

### Setup stage (you, before any code)

**Accounts and keys**

- [ ] GitHub: create the repo `lumen` and put the AI build brief tab in it as `AGENTS.md`.
- [ ] Supabase: create a project in a region near you (for example Singapore) and save the database password. Enable the `vector` extension. Copy the session pooler and transaction pooler connection strings. Turn the Data API off.
- [ ] Groq: create an API key.
- [ ] Google: create an OAuth client. GitHub: create an OAuth app. Register the local callback URLs (Better Auth's provider docs show them; with the default path they end in `/api/auth/callback/google` and `/api/auth/callback/github`). Save each client ID and secret.
- [ ] Vercel: sign in with GitHub. You import the repo in Phase 4. The free Hobby plan is non-commercial only.
- [ ] Container host (Render, Railway or Fly.io): create an account for Phase 3, when Express and Python go online.

**Your machine**

- [ ] Install Node.js (LTS), Python 3.11 or newer, Docker and Git.
- [ ] Install the tools in section 10 of the AI build brief.
- [ ] After Phase 0, copy `.env.example` to `.env` and fill in every value. Never commit it.

**Smoke tests.** Run these before Phase 0:

```bash
# 1. Groq: both models are listed and both answer
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $LLM_API_KEY" | grep -E "llama-3.1-8b-instant|llama-3.3-70b-versatile"
curl -s https://api.groq.com/openai/v1/chat/completions -H "Authorization: Bearer $LLM_API_KEY" -H "Content-Type: application/json" -d '{"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"Reply with OK"}]}'
# repeat the second command with "llama-3.3-70b-versatile"

# 2. Supabase: connect and enable pgvector (DATABASE_URL = your session pooler string)
psql "$DATABASE_URL" -c "create extension if not exists vector;" -c "select extname from pg_extension where extname = 'vector';"

# 3. Embedding model: must print 384
python -c "from sentence_transformers import SentenceTransformer as S; print(len(S('all-MiniLM-L6-v2').encode('hello')))"
```

- [ ] Groq lists both model names and answers from each. If a name is missing, pick the closest current model, then update `LLM_MODEL_CHEAP` or `LLM_MODEL_EXPENSIVE` and the brief.
- [ ] `psql` shows the `vector` extension.
- [ ] Python prints 384.
- [ ] Decide your limits (documents per tenant, requests per minute, requests per month) and put them in `.env` after Phase 0. The brief sets no values.

Prices are not needed yet. Copying Groq's prices into `config.yaml` is the first step of Phase 7.

**Done when** all three checks pass and no secret is in git.

### Build phases

Each phase is one prompt in section 8 or 9 of the AI build brief.

| Phase | Build | Done when |
| --- | --- | --- |
| 0 Scaffold | Repo folders, Docker database, SQL tables | `docker compose up -d db` works and the three tables exist |
| 1 RAG core | Chunk, embed, store and search, with the tenant test | `pytest` passes and `ask.py` finds the right chunk |
| 2 Python service | FastAPI endpoints, router, model calls | `curl` returns the full response shape and tests pass |
| 3 Express and Better Auth | Login, organizations, keys, upload, chat, logs | Sign in, upload and chat work with an API key |
| 3B Tenant models | Models table with encrypted provider keys, Models endpoints, backup models inside each tier in the Python service (from `docs/WEBSITE_GUIDE.md`) | A tenant's own key answers, a failing primary falls back, no key ever leaks |
| 4 Dashboard | Home page (steps, demo, quickstart, security; FAQ postponed), /docs and /privacy pages, sign-in (Google, GitHub, email and password), keys, documents, analytics, requests, usage meters. Follows `docs/DESIGN.md` | A new account gets a working key in under 5 minutes |
| 5 Proof | Isolation suite, three-way comparison (no test website) | Zero leaks and a `results.csv` |
| 6 Classifier | Train from labeled questions, only if the rules fall short | Beats the rules on held-out questions |
| 7 Pricing (reconsidering, not planned) | Prices in `config.yaml`, cost per request, cost and estimated savings in analytics and Requests, savings calculator, cost column in `results.csv`, provider spending caps, cost-spike alert | Costs match a hand calculation, and all earlier tests still pass |

## Security and isolation checklist

Tick these off before showing the service to anyone outside your test accounts.

- [ ] Every query in `store.py` filters by `tenant_id`, with no exceptions
- [ ] Two-tenant isolation test passes (Tab 3), and runs again after every change to `store.py`
- [ ] API keys are stored as hashes and shown once
- [ ] FastAPI is not reachable from the internet and rejects calls without `X-Internal-Secret`
- [ ] Secrets are in environment variables, `.env` is in `.gitignore`, and no key has ever been committed
- [ ] Uploads are limited by file type, file size and documents per tenant
- [ ] Rate limit per tenant (shared by `/v1/chat` and `/try`) plus a global cap that protects only the shared dev default key (tenants' own keys are limited by their own providers)
- [ ] Session cookie is `httpOnly`, `secure` in production and `sameSite: 'lax'`; dashboard form posts are protected against CSRF
- [ ] CORS allows only your dashboard origin
- [ ] OAuth redirect URIs are exact, and production uses HTTPS only
- [ ] Deleting a document deletes its chunks, not just the file record
- [ ] Full document text is never written to logs, and no page or FAQ promises a retention period that is not built
- [ ] The Requests and usage endpoints filter by tenant, and another tenant's request id returns 404
- [ ] Provider keys are encrypted at rest and never returned, logged or shown after saving; tenant endpoint URLs are checked against private addresses
- [ ] The prompt treats retrieved text as data: a document that says "ignore your instructions" must not change the model's behavior (test this with one planted document)
