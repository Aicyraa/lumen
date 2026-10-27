# apps/web

The Lumen dashboard and public site: React 19, Vite, React Router, TanStack Query and the Better Auth client. What each page does and the design system are in [docs/WEBSITE.md](../../docs/WEBSITE.md).

## Run

```sh
pnpm --filter @lumen/web dev      # http://localhost:5173 (strict port); the API must run at VITE_API_URL
```

| Script | What it does |
| --- | --- |
| `dev` / `preview` | `vite --port 5173 --strictPort` / `vite preview` |
| `build` | `tsc -b`, then `vite build` into `dist/` |
| `test` | `tsc -b`, then `vitest run` (jsdom, setup in `test/setup.ts`) |
| `typecheck` | `tsc -b`: `tsconfig.app.json` (src), `tsconfig.node.json` (vite.config.ts), `tsconfig.test.json` (test) |
| `lint` / `format` | `biome check .` / `biome format --write .` (root `biome.json`) |
| `clean` | removes `dist` and `node_modules/.cache` |

## Configuration

The app reads only `apps/web/.env` (copy `.env.example`); only `VITE_` variables reach the browser.

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | Base URL of the API. Defaults to `http://localhost:3000` in development. Required for a production build: without it the app shows a "Missing VITE_API_URL" screen. `/` (a single slash) makes the app call its own origin, which is how the Vercel deployment works |

`vercel.json` proxies `/api` and `/v1` to the API (see "Deployment" in the root [README](../../README.md)). Its `REPLACE-WITH-API-HOST` placeholder stays until deploy.

## Tests

```sh
pnpm --filter @lumen/web test                 # type-check, then vitest
LUMEN_REQUIRE_API_HOST=1 pnpm test            # deploy check: fails while REPLACE-WITH-API-HOST is still in vercel.json
```

Tests live in `test/`, which mirrors `src/` (`app`, `features/<feature>`, `shared`); `helpers.tsx` and `setup.ts` are there too. Tests import source with relative paths (`../../../src/...`). Do not put tests under `src/`. `test/app/icons.test.ts` checks the icon links, files and the ICO.

## Layout

```text
src/
  app/        main.tsx, App.tsx (routes), ErrorBoundary, ConfigMissing, NoProjectRedirect
  features/   one folder per feature; code used by one feature lives in it
    home/  docs/ (Docs, Privacy, Terms, DocLayout)  auth/ (SignIn, VerifyEmail, RequireSession, SessionCacheGuard, session helpers)
    projects/ (list, settings, shell + sidebar, usage meters)  documents/  keys/  try-it/  analytics/  requests/  models/  account/
  shared/     code used by two or more features
    ui/       Dialog, ui.tsx, Logo, Loading, icons, RouteCard, UsageCard, PublicLayout, AppFrame
    motion/   motion helpers and the copied Animate UI sources (animate-ui/, excluded from Biome)
    lib/      api wrapper, config, format, auth-client, guardedFetch, types (dashboard response shapes)
    styles/   styles.css (one global stylesheet: design tokens and all component styles)
test/         mirrors src/ (app, features/<feature>, shared); helpers.tsx and setup.ts live here
```

## Icons

`public/favicon.svg` is the single source of the mark; `favicon.ico` (16, 32, 48), `icon-32.png` and `icon-180.png` (apple-touch) are rendered from it. Every icon link in `index.html` carries `?v=<tag>`: change the tag whenever the mark changes, because browsers cache favicons by URL for a long time.
