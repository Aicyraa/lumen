# Lumen website

> **Purpose:** what each page and dashboard tab does (part 1), and the design system every screen follows: tokens, type, layout, components, motion and copy (part 2).
>
> **Audience:** anyone building or extending a screen in `apps/web`, and anyone checking what the product shows.
>
> **Status:** current. If this file and `AI_BUILD_BRIEF.md` disagree, the brief wins. Merged on 2026-10-27 from the former website guide and design guide.

## Contents

- [Part 1. Pages and tabs](#part-1-pages-and-tabs)
  - [Public site](#public-site)
  - [Dashboard](#dashboard)
  - [Design notes](#design-notes)
- [Part 2. Design system](#part-2-design-system)
  - [2.1 Character](#21-character)
  - [2.2 Color](#22-color)
  - [2.3 Type](#23-type)
  - [2.4 Layout](#24-layout)
  - [2.5 Components](#25-components)
  - [2.6 Motion](#26-motion)
  - [2.7 Copy](#27-copy)
  - [2.8 Don'ts](#28-donts)

## Part 1. Pages and tabs

What each page, tab and section of the Claude Design file `Lumen Website.dc.html` (in `docs/lumen-website-ui-mockups/project/`) does. `support.js` in that project is only the design-canvas runtime and has no product content. Build rules live in `AI_BUILD_BRIEF.md` and Part 2 of this file; if they disagree with this part, the brief wins, except that the Models tab (06) is in scope: backend in Phase 3B, UI in Phase 4. Sign-in also offers email and password (decided 2026-10-23, kept). Lumen pricing, the Savings section and the FAQ are on hold. Cost shown in the dashboard is the tenant's estimated provider cost from prices they enter per model (see `NOTES.md`).

> **Money comes last.** The design shows cost, savings, a calculator and example prices (Savings section, COST and EST. SAVINGS stats, cost columns, `cost_usd` in the demo). Per `AGENTS.md` none of this is built before Phase 7. Items marked **(Phase 7)** below are design-only until then.

The design file covers the **public site** (one scrolling home page plus a sign-in page) and the **dashboard** (six tabs behind sign-in).

### Public site

#### Home page

| # | Section | What it does |
| --- | --- | --- |
| nav | Product / Docs / Pricing, **Sign in**, **Get an API key** | Top bar. Both buttons lead to sign-in. Pricing link is **(Phase 7)**. |
| 01 | Hero: "RAG API for your chatbot" | One-line pitch, **Sign in to start** and **Read the docs** buttons, and a dashboard screenshot slot. |
| 02 | How it works | Three steps: upload documents, create an API key, call `/v1/chat`. |
| 03 | Demo (removed 2026-10-24) | The mockup's request/response demo with an EASY / HARD / NO ANSWER toggle. Not built: the home page now has an interactive routing diagram (section 03) instead. |
| 04 | Quickstart | cURL / Node / Python tabs with a copy button. Reminds the reader to call Lumen from their backend so the key stays server-side. |
| 05 | Savings **(Phase 7)** | Sliders for requests per month and share of easy questions; compares always-large-model against routed cost. |
| 06 | Built in | Three feature cards: cost-aware routing, tenant isolation, honest "no answer". |
| 07 | Security | Four cards: isolated per workspace, keys shown once (hashed), no document text in logs, documents treated as data (prompt-injection safe). |
| 08 | FAQ (postponed) | Accordion: file types and limits, what happens with no answer, cross-customer visibility, how savings are calculated, question retention. |
| end | CTA and footer | "Ask your documents anything." plus Sign in; footer links Docs, Privacy, Terms. |

The first design version (1a) had only sections 01-04 (Built in was 04). Version 2a
is the current one.

#### Sign in

One screen: "One login. Your own tenant." with **Continue with Google**,
**Continue with GitHub** and an email and password form (added 2026-10-23). A personal workspace (tenant) is
created on first sign-in.

### Dashboard

Shared shell on every tab: left nav with the six tabs, the workspace/user chip (for example "Campus FAQ / maya@campus.edu"), and a **USAGE** panel of meters (Documents 5/50, Requests per minute 52/60, This month 18,432/50,000). A meter turns amber above 80%. Request, document and rate limits are not money and are in scope before Phase 7; the "This month" meter's meaning should be checked against the brief.

#### 01 Documents

Upload and manage the files the chatbot answers from.

- Counter such as "5 of 50 · 214 chunks".
- Drop zone or **Choose files**: PDF, .txt or .md, up to 10 MB each.
- Table: file, status (ready / processing / failed), chunk count, upload date, **Delete**.
- A failed file shows why, for example a scanned PDF with no text layer.

#### 02 API keys

Create and revoke keys used in the `x-api-key` header.

- **Create key** opens a one-time panel with the full key, **Copy**, and "I've saved it".
  The key is never shown again; only a prefix is listed.
- Table: name, key prefix, created, last used, **Revoke**.
- Keys are stored as hashes and belong to the workspace.

#### 03 Try it

Ask a test question against your own documents without writing code.

- Question box and **Ask**.
- Answer with inline citations `[1]`, `[2]`.
- **Sources**: document, snippet, similarity score.
- **Route**: cheap or expensive tier, why, `k`, difficulty, escalated, top score.
- **Usage**: tokens in/out, latency (and estimated provider cost).

#### 04 Analytics

Traffic and routing overview with a **7D / 30D** toggle.

- Stat tiles: requests, median latency (p95 in the note); estimated provider cost is shown (tenant-entered model prices); savings stay on hold.
- Requests-per-day bar chart split cheap vs expensive.
- Route mix: cheap, escalated (caution), expensive (hard), no answer (no model called).
- **Unanswered questions**, in two sections so you know which documents to add: **No match** (the best-match score was weak, or no model was called) and **Not found** (a model ran, but its answer cited no sources; each row also shows the best score, the model that answered, the difficulty, and "escalated" when the router sent it to the larger model). The UNANSWERED tile is the sum of both.

#### 05 Requests (request log)

One row per call: time, query, route, `k`, latency (and estimated provider cost).

- Filter chips: ALL / CHEAP / EXPENSIVE / NO ANSWER.
- Click a row for the detail drawer: route explanation, difficulty, escalated, top score, `k`, token and latency usage, request id (a UUID), the API key used, and the source passages with scores.
- Logs hold the question, route and metadata, never document text.

#### 06 Models

Bring-your-own provider keys and tier ordering.

- Two groups: **Cheap** (easy questions) and **Expensive** (hard questions and escalations). The mockup also shows a **Fallback** group; the human removed it on 2026-10-24.
- Within a tier, models are tried top to bottom: PRIMARY then BACKUP 1, 2...
- Each row: model, provider, endpoint, masked key, status (Connected / Failing), ↑ ↓ reorder, **Remove**.
- **Add model** form: provider (OpenAI, Anthropic, Google, OpenAI-compatible), model ID, endpoint URL, API key, tier. **Test & save** checks the connection; new models go to the end of the tier.

### Design notes

- Dark editorial theme: near-black canvas, warm off-white type, one lime accent, mono uppercase labels, numbered sections (tokens in Part 2).
- Striped boxes are slots for real screenshots; marketing copy and sample data are placeholders.
- The Models tab (06) is built as Phase 3B (backend) and Phase 4 (UI).

## Part 2. Design system

Follow this when building or extending any Lumen screen (marketing site or dashboard). Reference files (in `docs/lumen-website-ui-mockups/project/`): `Lumen Website.dc.html` (static hi-fi screens, turn 2 is current) and `Lumen Prototype.dc.html` (interactive behaviour). Where the mockups differ from `docs/AI_BUILD_BRIEF.md` (the "Design source" list under Phase 4), the brief wins.

### 2.1 Character

Dark editorial. Near-black canvas, warm off-white type, a single lime accent. Oversized tight headlines, small uppercase monospace labels, hairline dividers, numbered sections. Calm and precise; no gradients, glows, emoji, drop shadows or icon clutter.

### 2.2 Color

| Token | Value | Use |
| --- | --- | --- |
| bg | `#0c0c0b` | Page / app background |
| surface | `#141413` | Cards, code blocks, modals |
| surface-active | `#1c1c1a` | Active sidebar item |
| hover-row | `#121211` | Table row hover |
| line-soft | `#1f1f1d` | Row dividers inside tables |
| line | `#262624` | Card borders, section dividers |
| line-strong | `#33332f` | Outline buttons, inputs, top rules on step/feature lists |
| line-dashed | `#44443f` | Upload drop zone (1px dashed) |
| text | `#efeee9` | Primary text, primary button fill |
| code-text | `#d8d7d1` | Text inside `<pre>` |
| text-2 | `#a9a8a2` | Body copy, inactive nav |
| text-3 | `#8d8c86` | Labels, metadata |
| text-4 | `#6d6c67` | Table headers, sub-labels in stat grids |
| lime (accent) | `oklch(0.88 0.17 118)` | Primary CTA, citation markers `[1]`, step numbers, "expensive" tier, savings, ready status |
| lime-soft | `oklch(0.8 0.12 118)` | Secondary accent in charts (escalated) |
| amber | `oklch(0.84 0.12 80)` | Processing status, usage meters above 80% |
| red | `oklch(0.72 0.15 28)` | Failed status, errors, Revoke, low match scores |

Rules: lime is used sparingly, at most one lime CTA per view. Text on lime or off-white fills is `#0c0c0b`. Links default to `#efeee9`, hover lime.

### 2.3 Type

- **Geist** (300–600) for everything; **Geist Mono** (400–500) for labels, numbers, code, IDs, keys.
- Self-hosted through `@fontsource/geist` and `@fontsource/geist-mono` (exact versions, imported in the web app); there is no Google Fonts link.

| Role | Spec |
| --- | --- |
| Hero H1 | 112px / 0.95, weight 500, letter-spacing -0.05em, `text-wrap: balance` |
| Closing CTA H2 | 96px / 0.95, 500, -0.05em |
| Sign-in H1 | 88px / 0.95, 500, -0.05em |
| Section H2 | 52px / 1.05, weight 400, -0.035em |
| Dashboard page title | 48px, 500, -0.04em |
| Feature row title | 44px, 400, -0.03em |
| Stat value | 44px, 500, -0.04em |
| Card title | 28–30px, 500, -0.03em |
| Answer text | 22px / 1.45 |
| Lead paragraph | 19px / 1.5, text-2 |
| Body | 14–15px / 1.55, text-2 |
| Section label | Geist Mono 11px, 500, letter-spacing 0.14em, UPPERCASE, text-3 |
| Table header | Geist Mono 11px, 500, 0.1em, text-4 |
| Mono data | Geist Mono 12–13px |

Fluid builds use `clamp()`: section H2 `clamp(32px,3.6vw,52px)`, feature title `clamp(28px,3vw,44px)`.

### 2.4 Layout

- Marketing frame: 1440px design width, side padding 48px (`clamp(20px,4vw,48px)` fluid).
- Section rhythm: 140px top padding between home sections (`clamp(80px,10vw,140px)`).
- Section header pattern: 2-column grid `1fr 2fr`, gap 48px — mono label left, H2 (and optional paragraph) right, or label + H2 + paragraph left and a card right.
- Section labels are numbered: `NAME — 0N` (e.g. `QUICKSTART — 04`). Dashboard pages use `0N — NAME`.
- Dashboard: grid `240px 1fr`; sidebar padding 28px 20px with 1px `line` right border; content padding 40px 56px, vertical gap 32px.
- Always lay out sibling groups with flex/grid + `gap`. Grids use `minmax(0,1fr)`.

#### Money

Lumen has no pricing of its own: omit the savings calculator section (keep the other sections' numbering as shown), the Pricing nav and footer links, the EST. SAVINGS stat and any Lumen price or `$` example. The cost columns, tiles and drawer fields stay, but they show the tenant's own estimated provider cost (from prices they enter per model), labelled "estimated provider cost", with "no price set" for unpriced models. Everything below describes the design; the brief decides what is built.

#### Home section order

01 Hero → image slot (560px, striped placeholder) → 02 How it works (3 steps) → 03 Demo (Easy / Hard / No answer request-response pair) → 04 Quickstart (cURL / Node / Python tabs + Copy) → 05 Savings calculator → 06 Built in (feature rows) → 07 Security (4 columns) → 08 FAQ (accordion; postponed, omit for now) → closing CTA → footer.

#### Dashboard nav

01 Documents · 02 API keys · 03 Try it · 04 Analytics · 05 Requests · 06 Models. Sidebar bottom: USAGE meters (Documents, Requests / min, This month), then workspace + email.

### 2.5 Components

- **Buttons** — pill, `border-radius: 999px`.
  - Primary: bg `#efeee9`, text `#0c0c0b`, 500 weight. Sizes: 10×18 (13px nav), 12×22 (14px dashboard), 16×28 (15px hero), 18×32 (CTA).
  - Accent: same shape, bg lime. One per view.
  - Outline: 1px `line-strong`, text `#efeee9`.
- **Segmented toggle / tabs** — container 1px `line-strong`, radius 999px, padding 4px, gap 4px, Geist Mono 12px. Active pill bg `#efeee9` text `#0c0c0b`; inactive transparent, text-2. Used for 7D/30D, code tabs, log filters, demo cases.
- **Card** — bg surface, 1px `line`, radius 14px (12px for nested detail cards), padding 24–32px. Starts with a mono section label.
- **Code block** — a terminal / editor window: muted dots and a title bar (language, Copy), then a `<pre>` in Geist Mono 13–16px / 1.75 with code-text, line numbers (a `$` prompt for shell) and syntax colours. The colours exist only inside code: keywords `oklch(0.76 0.1 305)`, keys, calls and flags `oklch(0.78 0.09 235)`, strings lime-soft, numbers and variables amber, comments text-4. Snippets that switch in place (tabs) share one fixed height.
- **Table** — CSS grid rows; header row mono 11px text-4 with `line` bottom border; rows padding 16–18px, `line-soft` divider, 14px text. Expandable rows show `+` / `−` in mono at the right and open into a 3-card detail grid (Route, Usage, Sources).
- **Status dot** — 7px circle + mono 12px label in the status color (ready lime, processing amber, failed red; cheap `#efeee9`, expensive lime, none text-3).
- **Score bar** — 4px track `#262624`, fill `#efeee9`, mono score beside it.
- **Usage meter** — label 12px text-2 + mono value `n / max`; 3px track `#262624`; fill text-2, switches to amber above 80%.
- **Stat strip** — 4-column grid between `line` top and bottom borders; mono label, 44px value, 12px note. Savings value in lime.
- **Numbered list** (steps, security) — 1px `line-strong` top rule, lime mono number, 21–28px title, 14–15px body.
- **Feature row / FAQ row** — 1px `line` top border, generous padding (24–36px), title left, `+`/`−` or body right.
- **Modal** — overlay `rgba(8,8,7,.72)`; panel 560px, surface, 1px `line-strong`, radius 16px, padding 36px; lime mono label on top.
- **Upload zone** — 1px dashed `line-dashed`, radius 14px, padding 36px, primary button right.
- **Image slot** — `repeating-linear-gradient(135deg,#141413 0 14px,#111110 14px 28px)`, 1px `line`, radius 14px, mono caption text-4. Replace with real screenshots.
- **Logo** — lime dot (9–10px) + "lumen" Geist 600, 17–18px, -0.02em.

### 2.6 Motion

Subtle and functional; all under ~600ms except the typewriter.

- Headlines: word-by-word fade/slide-up on load.
- Sections: fade + 24px slide-up when scrolled into view; reveal all after 4s as a fallback.
- Demo response: typewriter.
- Stats: count-up; chart bars grow from the baseline.
- Accordions / expanded rows: `opacity 0→1` over 250–300ms.
- Dashboard pages: each block rises in turn; rows, cards and buttons fade or lift on mount and hover. Docs and Privacy reveal each section as it scrolls in (scroll-driven, where the browser supports it). Active indicators (sidebar, docs contents) slide between entries.
- Respect `prefers-reduced-motion` by disabling all of the above.

### 2.7 Copy

- Plain, factual sentences. Sentence case for headings and buttons; UPPERCASE only for mono labels.
- Name things by what the API returns: route, tier (cheap / expensive / none), k, cost, latency, top score, escalated.
- Estimates are labelled as estimates ("EST. SAVINGS", "Estimate vs. always expensive").
- When there's no answer, say so: "I could not find that in the documents."
- Money: `$0.0012` per request, `$82.50` totals. Latency: `1,240 ms`. Dates: `Oct 21`.

### 2.8 Don'ts

- No new colors outside the table; no second accent. The only exception is the syntax colours inside code blocks (see Components).
- No gradients (except the image-slot stripe), shadows, glassmorphism or rounded cards with colored left borders.
- No emoji or decorative icons; status is communicated with dots and words.
- No Inter/Roboto/Arial; Geist only.
- Don't put text below 11px or use alpha-faded text; use the text-2/3/4 greys.
