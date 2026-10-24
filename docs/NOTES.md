# Notes

## 2026-10-23

- Phase 0 scaffold created: folders, docker-compose.yml, .env.example, infra/sql/001_app_tables.sql, README.

- Phase 0 acceptance checked by lead (Podman, no compose provider): db container starts; `\dx` lists vector 0.8.7; 001_app_tables.sql applies cleanly creating documents, chunks, request_logs; `.env` git-ignored and untracked. PASSED.
- Host port 5432 is taken by a system Postgres, so the dev DB maps to host port 5433 (`docker-compose.yml`, `DATABASE_URL` in `.env`).
- Podman equivalent of `docker compose up -d db`: `podman run -d --name lumen-db -p 5433:5432 -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD -e POSTGRES_DB=lumen -v lumen_db_data:/var/lib/postgresql/data docker.io/pgvector/pgvector:pg16`

## 2026-10-23 Phase 1 (RAG core)

- Built by rag-engineer on `phase-1-rag-core`; test-first (`test:` red stubs before each `feat:`). Python 3.14 worked with torch/sentence-transformers.
- Lead checks: pytest 16 passed; every SQL in store.py filters tenant_id; ask.py re-run on the sample handbook gave the right chunk in the top 3 (engineer's 5-question table: rank 1 for all, refund also rank 2); dev DB cleaned afterwards. lumen-reviewer: no blocking findings.
- Known: chunk() defaults 120/30 in code (dictated by prompt); delete_document count not atomic under concurrent inserts; embeddings load at import (~3s).

## 2026-10-23 Phase 2 (Python service)

- FastAPI service in rag-service/app (main, router, llm, config) built test-first on `phase-2-python-service`; 81 tests pass (lead re-ran). Reviewer: no rule violations; two low findings (NUL-byte upload 500, duplicate chunks on re-ingest) fixed in `85ae599`/`9c29422`.
- Lead checks: curl ingest then query with the real Groq test key (TEST_LLM_API_KEY, test only): answered with `[1]`, unrelated question returned the not-found message with zero model calls, cost_usd null, key absent from logs. Dev DB cleaned.
- Brief's Groq models (llama-3.1-8b-instant, llama-3.3-70b-versatile) return model_not_found for this key. Tested with openai/gpt-oss-20b (cheap) and openai/gpt-oss-120b (expensive) via env. gpt-oss emits `【1†L1-L4】` style citations at times; revisit when choosing models.
- Python does not write request_logs (Express will, using the returned request_id). Errors use `{error:{code,message}}`; Express reads `error.code`. Delete of another tenant's id returns 200 deleted_chunks 0.
- Open: `route.top_score` not in contract (needed by Phase 4 unanswered view); needs a brief change.

## 2026-10-23 Phase R (folder structure refactor, extra phase)

- Moved to a Turborepo + pnpm monorepo: apps/{api,web,rag-service}, tools/eval, docs/, infra/ stay; root has only tooling. rag-service wrapped by package.json (bootstrap, dev, test). `pnpm test` runs the 81 rag-service tests green from the root (lead ran it).
- Dropped the fake test website (outside work); Phase 5 now calls the public API directly. Brief, workflow, AGENTS.md and agent files updated for new paths.
- Brief amended: route.top_score added to the chat response (code change still to do in rag-service); Groq models now openai/gpt-oss-20b and openai/gpt-oss-120b.
- Root `index.tsx` (empty) removed; lucide-react moved from the root to apps/web.

## 2026-10-23 Phase 3 (Express API + Better Auth)

- Built in apps/api by api-engineer on `phase-3-express-api` (converted to TypeScript, run via tsx, ESM). 67 tests; lead re-ran. Reviewer: no hard-rule violations; low findings: dev-key route open when NODE_ENV unset, monthly count not atomic and counts provider errors, `monthly_limit` code not in brief, sweep skips orphaned tenants, in-memory rate limiter (single instance).
- Real e2e (rag-service + API, Groq test key): email sign-up creates personal org, upload reaches ready, chat answered with one request_logs row (tokens, latency, cost null), kill mid-ingest then restart sweeps to failed with no chunks, 401/404 isolation, shared 429 between /v1/chat and /api/dashboard/try. Google/GitHub browser sign-in NOT run (no OAuth credentials); email+password added as a third sign-in method.
- Better Auth 1.7.12 findings: apiKey({references:"organization"}); verifyApiKey returns key.referenceId as tenant; plugin rate limit defaults to 10/day per key, so disabled; `npx auth@latest migrate` unusable, use getMigrations via `pnpm auth:migrate`; Express 5 route `/api/auth/*splat`.
- Bug caught: Python DELETE /internal/documents also deletes the documents row, so Express must not call it for failed ingests (deletes partial chunks itself, tenant-scoped).
- Root `pnpm test` runs apps one at a time (`--concurrency=1`): api and rag-service tests share the lumen_test database and wipe each other when parallel. Lead ran root `pnpm test`: api 67 + rag-service 81 passed.
- Follow-up on the same branch: TypeScript port (74 tests plus tsc, lead ran root `pnpm test`: api 74 + rag-service 81), dev route only with NODE_ENV=development, global LLM cap default 8/min (Groq base limits for gpt-oss: 30 RPM, 8K TPM; tokens are the binding limit), logging failure no longer masks 502, `monthly_limit` code added to the brief. Reviewer: no blockers; the three fixes shared one commit and the red evidence is the engineer's report only.

## 2026-10-23 Alignment with docs/WEBSITE_GUIDE.md

- Decision: follow the guide for models. Tenants bring their own cheap, expensive and fallback models and provider keys (Models tab). `TEST_LLM_API_KEY` and the `LLM_*` variables are a dev/test default only. Brief updated: Phase 3B (backend) before Phase 4 (UI), `tenant_models` table, rules 11 (provider keys are secrets) and 12 (tenant endpoints are untrusted, SSRF), `MODEL_KEY_ENCRYPTION_SECRET`, tenant-model flow in section 7, Models endpoints in section 6.
- Conflicts left open for the human:
  1. Sign-in: guide says Google and GitHub only, no passwords; the brief now also enables email and password (added for local use).
  2. Phase 7 pricing: prices were one set in config.yaml per tier; with tenant-supplied models they must be per model. Marked OPEN in the brief.
  3. Try it "Sources: document, snippet, similarity score": the chat response has only document_id, chunk_id and score (no filename, no snippet) and the brief forbids storing chunk text. Needs a contract decision (filename join is fine; a snippet would be returned live but never stored).
  4. Requests drawer "source passages": brief stores ids and scores only; show filename and score, not passage text.
  5. FAQ "question retention": the brief forbids claiming or building a retention period; the home page FAQ must not mention it.
  6. Request ids: guide shows `req_...`, the service returns UUIDs.
  7. "Read the docs" and Docs/Privacy links on the home page: no docs or privacy page is specified anywhere.
  8. Global LLM cap (Phase 3) only protects the shared dev default key once tenants bring their own keys; per-tenant limits remain.
- apps/api reorganized by responsibility (config, db, auth, middleware, routes, services, lib, types; tests mirror src). No behaviour change: 74 api + 81 rag-service tests pass (lead ran root pnpm test).

### Decisions on the website-guide conflicts (2026-10-23)
- Sign-in: keep email and password alongside Google and GitHub.
- Pricing (Phase 7): dropped from the plan, marked "reconsidering". Tenants bring their own models. The no-cost rules in AGENTS.md stay.
- FAQ: postponed (also removes the retention-wording problem for now).
- Request ids: UUIDs, as the service already returns.
- /docs and /privacy pages: built with the website in Phase 4.
- Still open (needs the human): Try it sources contract (guide item 3), Requests drawer passages (item 4), global LLM cap meaning (item 8).

### Decisions 2026-10-23 (round 2)
- Try it: live snippet (option B). Requests drawer: passage read live from chunks, tenant-scoped (option B). Global LLM cap: only for the shared default key.
- Per-model usage, provider-reported limits and analytics for all models including fallback are in Phase 3B (data: model_calls table) and Phase 4 (UI). Token counts are recorded per attempt.
- Total cost across models: requested by the human, but it needs per-model prices and contradicts the on-hold pricing decision. Open question: add price fields to tenant_models and build cost on top of model_calls (a pricing phase), or keep deferring.

- Cost decision: show the tenant's estimated provider cost (their own spend), from per-model prices they enter in the Models tab; provider-reported cost preferred when present. Ships with Phase 3B (data, API) and Phase 4 (UI). AGENTS.md money rule reworded: Lumen itself still has no pricing, savings or calculator.

## 2026-10-23 Phase 3B (tenant models)

- API half (api-engineer) and Python half (rag-engineer) on `phase-3b-tenant-models`. Tests: api 230 (tsc + vitest), rag-service 149; lead ran root `pnpm test` (api and rag-service share lumen_test, so root runs them one at a time; during parallel work rag-service used `lumen_rag_test` via TEST_DATABASE_URL).
- Built: `infra/sql/002_tenant_models.sql` (tenant_models with optional per-model prices, model_calls per attempt with cost), AES-256-GCM key storage bound to tenant id, SSRF guard in both services (re-checked before each use; Python re-resolves before each call), models CRUD + usage endpoints, per-attempt model_calls, estimated provider cost (tokens x tenant-entered price per 1M; provider-reported cost preferred), Try it filename + snippet, global LLM cap only for the shared default key, tier/backup/fallback in /internal/query with `attempts`.
- Lead e2e (both services, real Groq test key, tenant model added through the API): chat and Try it answered through the tenant's model; cost 0.0000734 for 559 in / 105 out at 0.075/0.30 per 1M matches the hand calculation; usage endpoint totals match model_calls; Groq limits captured from headers (8000 TPM); bad key and 169.254.169.254 endpoint refused with nothing stored; no key in logs; dev DB cleaned. Fallback path through both services is covered by tests plus the Python engineer's direct Groq run (wrong primary, good backup), not run live through Express.
- Reviewer: no blockers on either half. Fixed: limits moved to config.json, endpoint re-check at use time, deep/case-insensitive log redaction, reported cost only from ok attempts, IPv6 ::/96 and fec0::/10 in the Python guard. Known: DNS rebinding between the Python check and connect (flagged in code), worst-case latency with many slow models vs Express timeout not checked, Anthropic/Google compatible endpoints read from docs only, Requests-detail passages deferred to Phase 4.
- Process caveat: both engineers committed on the same branch concurrently, so some Python tests and code landed inside API commits; test-before-code holds by content, not in git. Do not run two engineers in one working tree again.

## 2026-10-23 Phase 4 prep

- Design mockups added under docs/lumen-website-ui-mockups/project/ (not rendered by the lead; text and structure read). Overrides vs mockups recorded in the brief's Phase 4 "Design source" list.
- Google and GitHub OAuth apps created by the human; client ids and secrets are in .env; the human's Google account is a test user. Dev callbacks: http://localhost:3000/api/auth/callback/{google,github}, homepage http://localhost:5173.
- Order for Phase 4: api-engineer (missing dashboard endpoints: analytics summary/unanswered/by-model, requests list/detail with live passages, usage), then web-engineer. Never two engineers in one working tree at once.

## 2026-10-24 Phase 4 (dashboard and website)

- api-engineer: dashboard endpoints (usage, requests list/detail with live passages, analytics summary + by_model + unanswered, dashboard feedback, models usage shared service); web-engineer: apps/web (Vite, React 19, TypeScript, TanStack Query, Better Auth client, plain CSS tokens) with Home, /docs, /privacy, sign-in (Google, GitHub, email + password) and six dashboard tabs. Built from the mockups in docs/lumen-website-ui-mockups/project/ with the overrides in the brief (no Savings/Pricing/FAQ, UUID ids, estimated provider cost only).
- Tests (lead, root `pnpm test`): api 285 (tsc + vitest), rag-service 149, web 76; web production build ok.
- Real-browser run by the web engineer (Chromium, real API + rag-service + Groq test key): email sign-up, both models added via the UI with prices, key created and shown once, upload ready, Try it/Analytics/Requests/Models, reload keeps no provider key in the page, second account sees nothing, A/B/A/B user switching in one tab shows no foreign data, 415/413 server messages. Re-run after the review fixes (before the last two small fixes). Dev DB cleaned.
- Reviews found and fixed: provider and Lumen keys lingering in the TanStack mutation cache; cache not cleared on session change (cross-user flash risk) and query keys without org id; overclaiming Security copy; client-side upload limit; dialog focus re-trigger; contrast of --text-4 (#6d6c67 -> #807f7a); score bar clamp; cursor 500s for malformed cursors and year 0000; silent sign-out failure; hard-coded 10 MB in docs.
- Process: web engineer once swept a test file into the previous commit with `git add -A` (red run was still shown); engineers now ran one at a time in the tree.
- NOT run: Google and GitHub sign-in in a browser (needs the human's login). Steps: start the stack, open /signin, Continue with Google (tester account) and Continue with GitHub, expect to land on /dashboard/documents with a personal workspace.
- Open/low: 3 console 401s seen during sign-out/sign-in switching (not traced); hero image is the mockup's striped placeholder (replace with real screenshots later); chart has no date axis labels; tables are ARIA grids rather than <table>; the UI was not compared pixel-for-pixel with the mockups.
- Bug found by the human after Phase 4 (2026-10-24): with the API unreachable, / and /signin rendered then went blank (`data?.user.id` threw in SessionCacheGuard). Root cause: unsafe session shape access outside any error boundary; the engineer's browser run missed it because the API was up. Fixed in f7a98df/f26502b: one session-shape helper, optional chaining everywhere, top-level ErrorBoundary, "Cannot reach the server" states. Lead verified with a frame-by-frame page-text sampler (flash.mjs): / stays 2854 chars, /signin 204, no page errors with the API down. Lesson: browser checks must also cover the API-down case. Totals now: web 93, api 285, rag-service 149.
- Second post-Phase-4 bug (2026-10-24): Google/GitHub buttons showed "Something went wrong. Try again." Root cause: Vite reads env only from apps/web, there was no apps/web/.env, so VITE_API_URL was unset and the auth client and api() called the web origin (404 or index.html with 200). Same root cause as the blank page. Fixed in 2619a4f/9c3af62: shared resolveApiBase (dev default http://localhost:3000, production build without it shows a "Missing VITE_API_URL" screen), HTML answers are treated as API unreachable, social sign-in errors say what failed, README documents the Vite env rule. Lead reproduced it in Chromium first (POST went to :5173/api/auth/sign-in/social -> 404). Engineer verified without VITE_API_URL: Google and GitHub buttons navigate to accounts.google.com and github.com. A full OAuth round trip (consent and callback into /dashboard) is still NOT run: needs the human. Web tests now 101.

## 2026-10-24 Phase 4B planned (accounts, projects, website polish)

- From the human's manual test: same-email Google + GitHub sign-in linked into one user (Better Auth default implicit linking); different Google account got its own workspace (correct isolation). Decisions: require email verification (SMTP, dev prints the link), disable implicit linking with explicit linking in Account settings, projects = organizations with /projects and /projects/:slug routes, MAX_PROJECTS_PER_USER=5 (adjustable in .env), auto-created default "My project", structured docs page reachable signed in/out, hero fix, full-screen sections with scroll snap, Animate UI icons and motion. See the brief's Phase 4B. Merge of phase-4-dashboard waits for 4B.

## 2026-10-24 Phase 4B (accounts, projects, website polish) results

- 4B-1 API (api-engineer): email verification (SMTP, dev prints the link, production refuses to start without SMTP_URL and MAIL_FROM), disableImplicitLinking with explicit linkSocial, projects as organizations (list/create/rename/delete with type-the-name, MAX_PROJECTS_PER_USER=5, default "My project"), requireSession checks membership of the active project (403 no_active_project), dev-only /dev/verify-email. Reviewer findings fixed: pool exhaustion on concurrent creates (no pool client held during Better Auth calls, pool connect timeout), cap race on every creation path (lock in the organization create hook), per-email resend limit plus TRUST_PROXY (off by default, documented), tenant-prefixed upload files removed after delete commit, late chat writes for a deleted tenant write nothing, config literals. Known: creation lock and resend counters are per API process (multi-instance needs a DB-level guard); the FOR SHARE/UPDATE race with a committing delete is untested.
- 4B-2 web (web-engineer): /projects and /projects/:slug/* routes with switcher and settings, /account (linked methods, verification), /verify-email, sign-in icons, structured Docs and Privacy (sticky TOC with scroll-spy, reachable signed in or out), hero fixed, full-screen home sections with scroll-snap, Animate UI + motion across the site. Animate UI (npm @animate-ui/react + copied icon sources) needed neither Tailwind nor the shadcn CLI; licence MIT with the Commons Clause (fine to use in an app, not to resell the components). Browser-verified at 1355x700, 1440x900, 390x844 (screenshots v3-*). Two things that broke and were fixed: docs scroll-spy picking a stale section; Vitest 5 failing tests on throwing mocks. Reduced-motion path only covered by jsdom tests.
- Lead checks: root `pnpm test` api 364, rag-service 149, web 150; web build ok. Process: the web agent was cut off once by a session limit and resumed from its saved commits.
- Not run: Google/GitHub consent and linking (needs the human); resend 429 and owner-only delete in a browser (API tests cover them).

## 2026-10-24 Round 3 requests (UI tweaks, database, codebase)

- Human asked for 13 UI tweaks, database normalization with a development branch, and 8 codebase restructure items. Order decided: R2 restructure (+ env split) -> DB normalization (+ Supabase branch `development`, cost approved in principle by the human; confirm the plan/price first) -> 4C UI tweaks. phase-4-dashboard is still unmerged (waiting on the human's merge decision); R2 branches from it.
- Supabase project `lumen` (ap-northeast-2) exists, empty, no branches (checked with MCP, read-only).
- Duplicate scan (content hash): only empty files (.gitkeep, __init__.py); no duplicated sources. `apps/web/.gitkeep` removed in R2.

## 2026-10-24 Phase R2 (codebase restructure) results

- Behaviour-preserving restructure of all apps on `phase-r2-restructure`: rag-service (api/core/ingest/retrieval/llm, pyproject.toml, `python -m app.cli`), api (modules/<feature> + shared, tests mirror src, tsconfig split, Biome), web (app/features/shared, tests in test/, tsconfig split, Biome). Root: scripts (bootstrap, dev, build, test, typecheck, lint, format, check, clean, db:*, env:*), turbo tasks with inputs/outputs, biome.json, tsconfig.base.json, .editorconfig, .nvmrc, scripts/env.mjs and scripts/db.mjs (numbered migrations tracked in schema_migrations; existing dev DB baselined).
- Test counts: api 364 (names identical), web 150 (names identical), rag-service 149 originals plus 13 new CLI/env tests = 162. Lead ran `pnpm check` from the root: all green.
- Env split: `.env` files now live in apps/api, apps/rag-service, apps/web, infra; the repo-root .env and .env.example were removed. A local backup `.env.root-backup` (git-ignored, contains secrets) still exists at the root: delete it when you are happy. `pnpm env:check` verifies required variables and that DATABASE_URL and INTERNAL_SECRET agree between api and rag-service (never prints values).
- Biome rules switched off deliberately (api: non-null assertion, template literal, explicit any; web: hook dependencies, array index keys, several a11y rules for the role=row grids): clean up later. Web `styles.css` is one global file (not split).
- Not run: `pnpm dev` from the root (the human's servers hold 5173 and 8000; dev task graph resolves to api, rag-service and web).

## 2026-10-24 Phase DB planning

- Reviewer R2 findings fixed (5a43ae3): db baseline now records a migration as applied only when its own table exists (tested on a fresh DB and a DB with only 001), docker compose gives a clear message when the password is missing, Biome key rules re-enabled in web src (index keys off), URL path for the api env file.
- Supabase org is on the Free plan (no branching). Human decision: apply the normalized schema to the main project `lumen` (empty, no data). Design in docs/DATABASE.md.

## 2026-10-24 Phase DB results

- Local dev and test databases migrated 003-009 (`pnpm db:migrate`, then `pnpm --filter @lumen/api auth:migrate` for Better Auth RLS). Counts: api 389, rag-service 168, web 150; `pnpm check` green.
- Reviewer findings fixed before Supabase: RLS and revokes for Better Auth tables (infra/sql/auth/001), default privileges and sequences (007), composite chunk FK for request_sources (008). Advisor follow-up: 009 (FK-ordered indexes).
- Supabase main project `lumen` migrated (human's explicit decision, Free plan has no branching, project was empty): see docs/DATABASE.md. Security advisor: no errors; one accepted WARN (vector in public). Mistake worth remembering: apply Supabase migrations one at a time; sending several in parallel made 004, 006 and 008 fail and run out of order.
- Not done: the services have not connected to Supabase yet (needs DATABASE_URL from infra/.env with the session pooler or direct string); the hook gap where an organization exists without a tenants row is documented, not repaired.

## 2026-10-24 Phase 4C (UI tweaks) results

- API: GET /api/dashboard/account (own profile, providers without secrets, projects owned vs max, totals across member projects); web: the 13 tweaks (Product page with 9 full-screen sections and an animated routing diagram, Docs tabs with hash and keyboard, viewport-triggered animations, sidebar without logo/Docs/numbers and not scrolling, All projects button, provider display name, centred StatusMessage on every tab, Analytics and Models redesigns with Add model modal, richer Account page, SVG logo + favicon + apple-touch).
- Counts: api 392, rag-service 168, web 206; `pnpm check` green (lead). Reviewer: no critical/high; fixed afterwards: usage-error state on Models, missing per-tab state tests, one "no price set" wording, short-window sidebar scroll valve (<560px tall), favicon hex fallback. Cost text bug (prices set but "no price set" shown) fixed in a236be2.
- Engineer browser-verified at 1366x768, 1440x900, 390x844 (screenshots v4-*), sidebar 700/700. Lead looked at 4 screenshots. Not run: Google/GitHub display names and linking in a real browser (email+password only), real touch devices, other browsers.
- Still open: the human's own Google/GitHub round trip; deleting `.env.root-backup`; Biome rules left off (see R2 notes); Supabase `vector` extension warning accepted.

## 2026-10-24 Phase 4D (second round of UI tweaks)

- Web only on `phase-4d-ui-tweaks`: sticky public nav; use-cases section removed; section headings stacked under their labels; only the hero fills a screen (other sections content height, proximity snap kept); a design per section; new logo (lime leaf with folded corner, SVG, light and dark files, favicon + PNGs); Projects page grid with a summary strip and a create card; Try it centred; Models tooltips instead of the paragraph; custom project dropdown (listbox keyboard support, All projects as last entry); Docs header block removed (visually hidden h1 kept); sidebar brand footer, no big All projects button.
- Counts: web 257, api 392, rag-service 168; `pnpm check` and `pnpm build` green (lead). Reviewer: no blockers; fixed: dead CSS, scroll offsets for the sticky nav, ProjectMenu edge cases, InfoTip viewport clamp, separate logo SVG files.
- Engineer browser-verified at 1366x768, 1440x900, 390x844 (v5-*); lead looked at home, projects, sidebar dropdown, sign-in. Not run: Google/GitHub, other browsers, mutation checks on the new tests. Privacy keeps its intro block. One earlier commit (home) broke `vite build` and the next fixed it.
- Groq: all three models (openai/gpt-oss-20b cheap, openai/gpt-oss-120b expensive, qwen/qwen3.8-27b fallback) answered a tiny completion through https://api.groq.com/openai/v1 with the test key. The human will add them to their Lumen project; a real end-to-end question through their Lumen key is still to run.

## 2026-10-24 Phase 4E (fallback removed, third round of UI tweaks)

- Logic: the fallback tier/model is removed. API (tier type cheap|expensive, POST rejects 'fallback', models list `{ cheap, expensive }`, no `fallback_uses`, migration 010 deletes fallback tenant_models rows and restricts the tier check; model_calls.tier keeps 'fallback' for history only), rag-service (plan_models: chosen tier top to bottom, empty tier uses the other, whole tier fails -> 502 with attempts, stray `fallback` key ignored), web (two tier cards, no fallback copy). Counts: api 395, rag-service 169, web 280. Migration 010 is applied to the local dev database only; NOT yet applied to Supabase (human to approve).
- UI (web, in a git worktree because Codex works in the main checkout on `codex_rag`): sidebar (logo + Projects icon, plain project label, full-width Sign out, dropdown and brand footer removed), three-line logo, favicon fix (cause: same URLs with no cache-busting, /favicon.ico 404; now ?v=4e, real favicon.ico, new file names), Docs/Privacy full-height layout with only the content region scrolling, Home (section 02 rescaled, Demo removed, Built in 05, Quickstart 06, Security 07, interactive routing diagram with four scenarios, replayable enter/leave animations), edge labels on chips, entrance <= 0.56 s.
- Reviewer: no critical/high; fixed label overlap, entrance timing, docs anchor offsets for the inner scroller, duplicate CSS, brief and guide leftovers. Not run: Google/GitHub, other browsers, touch.
- Process: two agents share the repository: Codex on branch `codex_rag` in /home/jee/Desktop/Code/Projects/lumen (docs/ is in its .gitignore only), UI work in the worktree /home/jee/Desktop/Code/Projects/lumen-ui on phase-4e-ui-and-fallback. Watch for conflicts in apps/rag-service when merging codex_rag with this branch.

## 2026-10-24 RAG quality adjustment (five uploaded synthetic PDFs)

- User authorized live testing and RAG adjustments, keeping the classifier outside scope. Five ready PDFs, 31 chunks; tested through the local public API using the supplied project key, never saved in the results. This is a focused quality check, not the complete Phase 5 evaluation.
- Baseline: 12/15 strict answer checks. INT-027, internship eligibility comparison, and research ethics evidence were outside the retrieved passages. Added tenant-scoped PostgreSQL full-text/vector rank fusion, cheap retrieval depth 3 → 5, and output allowance 512 → 1024 (the comparison had hit the old limit). No new dependencies, migration, re-ingestion or production deployment.
- After: all three retrieval failures fixed; 14/15 strict baseline answer checks and 5/5 additional factual checks. One absent-information question used a generic safe refusal instead of the exact not-found sentence. One additional housing answer has correct facts but incomplete citation support. Several outputs use non-ASCII citation markers. Recorded separately from factual correctness in docs/rag-testing/2026-10-24/REPORT.md, with all questions and raw before/after responses.
- Test-first commit e78cc04: 9 failed, 21 passed before implementation. Full RAG suite afterward: 176 passed in 53.77s; Ruff and formatting checks passed. Used a new dedicated local database lumen_rag_quality_20261024_test; no existing development or test data reset. Graphify AST refreshed (SQL parser dependency unavailable).
- Limits: small synthetic English corpus, one live run; original PDFs unavailable after ingestion, so extraction completeness unverified. Mean input tokens rose about 40%; median latency 956 → 1064 ms on the comparable 15 questions. No large-corpus/load/production validation. The semantic no-answer gate still precedes hybrid search. No push or merge.

## 2026-10-24 BM25, reranker and known answer-quality fixes

- User requested the known fixes, BM25, and a reranker (confirmed separately from changing the chat model). Located PDFs 06–08 in Downloads and ingested them through the supplied project's public API. Eight PDFs are ready, 66 chunks. Located all eight originals; every stored chunk sequence reconstructs its full pypdf-extracted word sequence. Visual table layout/OCR remain unchecked.
- Replaced ts_rank with actual tenant-local BM25 (term frequency, document length and inverse document frequency; k1=1.2, b=0.75). Kept vector retrieval and RRF. A positive BM25 result can rescue a question below the semantic no-answer threshold. No database DDL, dependencies, model-key edits or re-embedding.
- Added the local sentence-transformers CrossEncoder reranker, pinned cross-encoder/ms-marco-MiniLM-L6-v2 revision 233902d25c440f23af6f7d6e94d2946bac0bee0a. Reranks 30 candidates, returns existing 5/8 final passage counts, preserves public cosine scores. Cached weights only at runtime; failure falls back to fused ordering. Prefetch documented in apps/rag-service/README.md. The routing classifier and tenant chat-model identities are unchanged.
- Chat models now supply claim/evidence JSON. Verbatim quote and passage validation precedes ASCII citation rendering; equivalent PDF typography is normalized, unique wrong-passage assignments corrected. One repair is allowed; all attempts count toward usage; invalid evidence after repair returns 502. Empty claims, recognized generic refusals and absence-only document claims use the canonical not-found sentence. Known negative policies are preserved. This validates attribution, not logical entailment.
- Test-first commits: 5c4cc55 (18 red), ae949c0 (7 red), 4c43a10 (typography/citation recovery), 8448705 (2 red). Final RAG suite: 212 passed in 52.10s; Ruff, formatting and git diff whitespace checks passed. Used the dedicated local quality-test database, never reset existing project or other test data. Graphify AST refreshed: 1,976 nodes, 4,308 edges; SQL parser unavailable.
- Live: 34/34 HTTP successes plus 7/7 final targeted rechecks. Latest six absent-information answers use exact not-found wording; citations are ASCII and in range, and housing attribution is corrected. Manual review marks 32/34 satisfactory and two partial: broad renewal answer still omits the reduced-load qualification, and the PHP 29,500 budget answer still omits the requested component breakdown. Prompt-only tightening did not resolve those omissions; they are not reported as fixed. Full records: docs/rag-testing/2026-10-24-bm25-reranker/REPORT.md (local, under the user's ignored docs directory).
- Limits/tradeoff: 28-query offline comparison measured median 75 ms retrieval + 1,574 ms reranking. Full live median 3,028 ms. Comparable 10-question expanded-corpus subset: median 1,237 → 3,356 ms; mean input tokens 1,055 → 1,275, output 397 → 914 (reasoning/repairs included). The subset's core facts were already correct before changes; no controlled accuracy gain is claimed. Initial 1024-token runs hit output/provider limits, so allowance is now 2048 and live requests were spaced 20 seconds apart. BM25 scans per-tenant content per request; larger datasets, other languages/topics, production and concurrent load are unverified. No push, merge or deployment.

## 2026-10-24 Integration of codex_rag (branch `integrate-codex-rag`, worktree /home/jee/Desktop/Code/Projects/lumen-integration)

- `phase-4e-ui-and-fallback` was merged into `c_v1` (c2cb387). `integrate-codex-rag` was created from c_v1 and `codex_rag` (nine commits: hybrid BM25 + vector rank fusion, tenant-local BM25, cross-encoder reranker, quote-backed claim answers with one repair attempt) merged into it. Only conflict: docs/NOTES.md (both sides kept). Codex's RAG code won in apps/rag-service (no overlap with the fallback removal: Codex's branch already contained it). `.gitignore` `docs/` line and `.codex/` from the Codex checkout were uncommitted there and are NOT part of this merge; c_v1 is untouched by this integration.
- Verified in the integration worktree: rag-service 212 passed (dedicated scratch database), api 395, web 280; ruff check and format clean; biome clean for api, web warnings only.
- RAG docs updated from codex_rag: brief section 7 (flow steps 2-6, config sample, answer prompt now claims/evidence JSON with server-rendered citations), PROJECT_WORKFLOW chat journey, serena tech_stack, rag-engineer agent description. Contract changes to remember: `usage` tokens for a request are the sum over all attempts including the repair; k_cheap is 5; max_output_tokens 2048; new config blocks retrieval and reranker; reranker weights must be prefetched before deployment (cache only at request time).
- Open from Codex's notes: small synthetic corpus only (eight PDFs); latency up (median reranking about 1.6 s offline, live median about 3 s); reasoning-heavy models raise output tokens; large-corpus and load behaviour unmeasured; Phase 5 evaluation should re-measure cheap vs expensive with the new pipeline.

## 2026-10-24 Phase 5 (isolation suite and evaluation harness) results

- Worktree `/home/jee/Desktop/Code/Projects/lumen-p5`, branch `phase-5-eval` (from c_v1 with the merged codex_rag pipeline). rag-service: optional internal-only `force_tier` on /internal/query (rag tests 226). tools/eval: questions.csv (43 drafted queries: 13 easy, 12 hard, 9 multi-document, 9 unanswerable; expected_answer, held_out, cheap_ok, expensive_ok EMPTY for the human), run_eval.py (three setups, LLM judge, verdicts.csv with a 20% review sample, results.csv, backoff, resume keyed by setup/tenant/query/answer/judge, dry run, system-error handling), isolation suite (`pnpm eval:isolation`). tools/eval tests 111.
- Isolation suite (lead re-ran twice, reviewer once): scratch database, own API and rag-service, stub model that quotes the first retrieved passage, two tenants with planted code words; 64 cross-tenant questions + 14 positive checks + 30 object-level and dashboard checks: zero leaks in 108 checks. Negative controls (combined, vector-only, keyword-only predicate removal) detect leaks (A 110/B 109, A 110/B 109, A 58/B 64) with 0 problems. Mandatory guards: at least 50 cross-tenant questions and 10 positive checks.
- Bugs found on the way: the cross-tenant counter was never incremented (summary showed 0) and a loop variable shadowed the scratch database name once (left lumen_isolation_1792853852 behind, dropped by hand; now guarded by a drop helper that only accepts lumen_isolation_<digits>); Groq answers 403 to urllib's default User-Agent.
- Not run: the real evaluation (needs expected_answer values from the human and tools/eval/.env), a real provider for the isolation suite (stub only), direct rag-service calls with a mismatched tenant_id (Express supplies the tenant). The human's checklist: fill expected_answer for every question; mark about a quarter held_out across all types and do not tune on them; copy tools/eval/.env.example to .env; run run_eval.py; spot-check flagged rows in verdicts.csv; read every confident-and-wrong case. Phase 6 (classifier) only if the rule router misroutes many questions; the cost ratio must be written in NOTES before running.
