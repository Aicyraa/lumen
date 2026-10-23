# Lumen website guide

What each page, tab and section of the Claude Design file `Lumen Website.dc.html`
(in `docs/lumen-website-ui-mockups/project/`) does. `support.js` in that project is only the design-canvas runtime and has no
product content. Build rules live in `AI_BUILD_BRIEF.md` and `DESIGN.md`; if they
disagree with this guide, the brief wins, except that the Models tab (06) is in scope: backend in Phase 3B, UI in Phase 4. Sign-in also offers email and password (decided 2026-10-23, kept). Lumen pricing, the Savings section and the FAQ are on hold. Cost shown in the dashboard is the tenant's estimated provider cost from prices they enter per model (see docs/NOTES.md).

> **Money comes last.** The design shows cost, savings, a calculator and example
> prices (Savings section, COST and EST. SAVINGS stats, cost columns, `cost_usd` in
> the demo). Per `AGENTS.md` none of this is built before Phase 7. Items marked
> **(Phase 7)** below are design-only until then.

The file has two parts: the **public site** (one scrolling home page plus a sign-in
page) and the **dashboard** (six tabs behind sign-in).

## Public site

### Home page

| # | Section | What it does |
|---|---------|--------------|
| nav | Product / Docs / Pricing, **Sign in**, **Get an API key** | Top bar. Both buttons lead to sign-in. Pricing link is **(Phase 7)**. |
| 01 | Hero: "RAG API for your chatbot" | One-line pitch, **Sign in to start** and **Read the docs** buttons, and a dashboard screenshot slot. |
| 02 | How it works | Three steps: upload documents, create an API key, call `/v1/chat`. |
| 03 | Demo | Toggle EASY / HARD / NO ANSWER to see a sample `POST /v1/chat` request and the JSON response (answer, `route.model_tier`, `k`, `escalated`, usage). Shows how routing differs per question type. |
| 04 | Quickstart | cURL / Node / Python tabs with a copy button. Reminds the reader to call Lumen from their backend so the key stays server-side. |
| 05 | Savings **(Phase 7)** | Sliders for requests per month and share of easy questions; compares always-large-model against routed cost. |
| 06 | Built in | Three feature cards: cost-aware routing, tenant isolation, honest "no answer". |
| 07 | Security | Four cards: isolated per workspace, keys shown once (hashed), no document text in logs, documents treated as data (prompt-injection safe). |
| 08 | FAQ (postponed) | Accordion: file types and limits, what happens with no answer, cross-customer visibility, how savings are calculated, question retention. |
| end | CTA and footer | "Ask your documents anything." plus Sign in; footer links Docs, Pricing, Privacy. |

The first design version (1a) had only sections 01-04 (Built in was 04). Version 2a
is the current one.

### Sign in

One screen: "One login. Your own tenant." with **Continue with Google**,
**Continue with GitHub** and an email and password form (added 2026-10-23). A personal workspace (tenant) is
created on first sign-in.

## Dashboard

Shared shell on every tab: left nav with the six tabs, the workspace/user chip
(for example "Campus FAQ / maya@campus.edu"), and a **USAGE** panel of meters
(Documents 5/50, Requests per minute 52/60, This month 18,432/50,000). A meter turns
amber above 80%. Request, document and rate limits are not money and are in scope
before Phase 7; the "This month" meter's meaning should be checked against the brief.

### 01 Documents
Upload and manage the files the chatbot answers from.
- Counter such as "5 of 50 · 214 chunks".
- Drop zone or **Choose files**: PDF, .txt or .md, up to 10 MB each.
- Table: file, status (ready / processing / failed), chunk count, upload date, **Delete**.
- A failed file shows why, for example a scanned PDF with no text layer.

### 02 API keys
Create and revoke keys used in the `x-api-key` header.
- **Create key** opens a one-time panel with the full key, **Copy**, and "I've saved it".
  The key is never shown again; only a prefix is listed.
- Table: name, key prefix, created, last used, **Revoke**.
- Keys are stored as hashes and belong to the workspace.

### 03 Try it
Ask a test question against your own documents without writing code.
- Question box and **Ask**.
- Answer with inline citations `[1]`, `[2]`.
- **Sources**: document, snippet, similarity score.
- **Route**: cheap or expensive tier, why, `k`, difficulty, escalated, top score.
- **Usage**: tokens in/out, latency (and estimated provider cost).

### 04 Analytics
Traffic and routing overview with a **7D / 30D** toggle.
- Stat tiles: requests, median latency (p95 in the note); estimated provider cost is shown (tenant-entered model prices); savings stay on hold.
- Requests-per-day bar chart split cheap vs expensive.
- Route mix: cheap, escalated (caution), expensive (hard), no answer (no model called).
- **Unanswered questions**: questions with a weak best-match score, listed so you know which documents to add.

### 05 Requests (request log)
One row per call: time, query, route, `k`, latency (and estimated provider cost).
- Filter chips: ALL / CHEAP / EXPENSIVE / NO ANSWER.
- Click a row for the detail drawer: route explanation, difficulty, escalated, top score, `k`, token and latency usage, request id (a UUID), the API key used, and the source passages with scores.
- Logs hold the question, route and metadata, never document text.

### 06 Models
Bring-your-own provider keys and tier ordering.
- Three groups: **Cheap** (easy questions), **Expensive** (hard questions and escalations), **Fallback** (used when a whole tier fails or times out).
- Within a tier, models are tried top to bottom: PRIMARY then BACKUP 1, 2...
- Each row: model, provider, endpoint, masked key, status (Connected / Failing), ↑ ↓ reorder, **Remove**.
- **Add model** form: provider (OpenAI, Anthropic, Google, OpenAI-compatible), model ID, endpoint URL, API key, tier. **Test & save** checks the connection; new models go to the end of the tier.

## Design notes
- Dark editorial theme: near-black canvas, warm off-white type, one lime accent, mono uppercase labels, numbered sections.
- Striped boxes are slots for real screenshots; marketing copy and sample data are placeholders.
- The Models tab (06) is built as Phase 3B (backend) and Phase 4 (UI).
