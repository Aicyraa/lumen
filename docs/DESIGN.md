# Lumen — Design guide

Follow this when building or extending any Lumen screen (marketing site or dashboard). Reference files: `Lumen Website.dc.html` (static hi-fi screens, turn 2 is current) and `Lumen Prototype.dc.html` (interactive behaviour).

## 1. Character

Dark editorial. Near-black canvas, warm off-white type, a single lime accent. Oversized tight headlines, small uppercase monospace labels, hairline dividers, numbered sections. Calm and precise; no gradients, glows, emoji, drop shadows or icon clutter.

## 2. Color

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

## 3. Type

- **Geist** (300–600) for everything; **Geist Mono** (400–500) for labels, numbers, code, IDs, keys.
- Load: `https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap`

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

## 4. Layout

- Marketing frame: 1440px design width, side padding 48px (`clamp(20px,4vw,48px)` fluid).
- Section rhythm: 140px top padding between home sections (`clamp(80px,10vw,140px)`).
- Section header pattern: 2-column grid `1fr 2fr`, gap 48px — mono label left, H2 (and optional paragraph) right, or label + H2 + paragraph left and a card right.
- Section labels are numbered: `NAME — 0N` (e.g. `QUICKSTART — 04`). Dashboard pages use `0N — NAME`.
- Dashboard: grid `240px 1fr`; sidebar padding 28px 20px with 1px `line` right border; content padding 40px 56px, vertical gap 32px.
- Always lay out sibling groups with flex/grid + `gap`. Grids use `minmax(0,1fr)`.

### Money comes last

Everything that shows money (savings calculator, cost and savings stats, cost columns, `$` figures, pricing copy) is built in Phase 7, after the rest is tested. Until then omit the calculator section (keep the other sections' numbering as shown, so adding it later changes nothing), show no cost or savings stat, and leave cost columns out of the Requests table and detail cards. Everything below describes the final design.

### Home section order
01 Hero → image slot (560px, striped placeholder) → 02 How it works (3 steps) → 03 Demo (Easy / Hard / No answer request-response pair) → 04 Quickstart (cURL / Node / Python tabs + Copy) → 05 Savings calculator → 06 Built in (feature rows) → 07 Security (4 columns) → 08 FAQ (accordion; postponed, omit for now) → closing CTA → footer.

### Dashboard nav
01 Documents · 02 API keys · 03 Try it · 04 Analytics · 05 Requests · 06 Models. Sidebar bottom: USAGE meters (Documents, Requests / min, This month), then workspace + email.

## 5. Components

- **Buttons** — pill, `border-radius: 999px`.
  - Primary: bg `#efeee9`, text `#0c0c0b`, 500 weight. Sizes: 10×18 (13px nav), 12×22 (14px dashboard), 16×28 (15px hero), 18×32 (CTA).
  - Accent: same shape, bg lime. One per view.
  - Outline: 1px `line-strong`, text `#efeee9`.
- **Segmented toggle / tabs** — container 1px `line-strong`, radius 999px, padding 4px, gap 4px, Geist Mono 12px. Active pill bg `#efeee9` text `#0c0c0b`; inactive transparent, text-2. Used for 7D/30D, code tabs, log filters, demo cases.
- **Card** — bg surface, 1px `line`, radius 14px (12px for nested detail cards), padding 24–32px. Starts with a mono section label.
- **Code block** — `<pre>` Geist Mono 13px / 1.7–1.75, code-text; lime highlights a single key value.
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

## 6. Motion

Subtle and functional; all under ~600ms except the typewriter.
- Headlines: word-by-word fade/slide-up on load.
- Sections: fade + 24px slide-up when scrolled into view; reveal all after 4s as a fallback.
- Demo response: typewriter.
- Stats: count-up; chart bars grow from the baseline.
- Accordions / expanded rows: `opacity 0→1` over 250–300ms.
- Respect `prefers-reduced-motion` by disabling all of the above.

## 7. Copy

- Plain, factual sentences. Sentence case for headings and buttons; UPPERCASE only for mono labels.
- Name things by what the API returns: route, tier (cheap / expensive / none), k, cost, latency, top score, escalated.
- Estimates are labelled as estimates ("EST. SAVINGS", "Estimate vs. always expensive").
- When there's no answer, say so: "I could not find that in the documents."
- Money: `$0.0012` per request, `$82.50` totals. Latency: `1,240 ms`. Dates: `Oct 21`.

## 8. Don'ts

- No new colors outside the table; no second accent.
- No gradients (except the image-slot stripe), shadows, glassmorphism or rounded cards with colored left borders.
- No emoji or decorative icons; status is communicated with dots and words.
- No Inter/Roboto/Arial; Geist only.
- Don't put text below 11px or use alpha-faded text; use the text-2/3/4 greys.
