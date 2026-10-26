# Lumen — one-minute product promo

An editable Remotion promo based on `Aicyraa/lumen` main at
`2e451e70edb6aa6e550aa8e1c70302be727999c2`. Work lives on
`promo/lumen-rag-video`; the application and its dependency files are unchanged.

**60 seconds · 1920 × 1080 · 30 fps · 1,800 frames.**
Lumen’s actual logo, self-hosted Geist fonts, near-black/off-white palette and
lime accent. Original electronic music, generated locally with no sampled assets.
Text-led; no voiceover or external provider credentials required.

## Preview

This is a standalone project under `tools/`, outside the application workspace.
Node 24 is recommended. Use the existing checkout; no separate Git worktree is needed.

```sh
cd /workspace/lumen/tools/lumen-promo
npm ci --workspaces=false
npm run dev -- --no-open
```

Open `http://localhost:3100/LumenPromo`. Press Space to play/pause. The five scene
compositions are also individually editable in the **Scenes** folder.
`npm run dev` generates the original score if absent. The generated WAV is ignored;
its deterministic source is `scripts/score.mjs`.

## Storyboard

| Time | Scene | Message |
| --- | --- | --- |
| 00–07 | Meet Lumen | Your documents. Answers that connect. |
| 07–19 | Seamless RAG integration | Upload documents → create a project API key → call `POST /v1/chat` from your backend. |
| 19–31 | The RAG service | Chunk → embed → hybrid retrieval → rerank; tenant-scoped context and quote-checked citations. |
| 31–49 | Cheap + expensive model routing | Easy question → cheap model; hard or uncertain → expensive model; no relevant match → no model call. |
| 49–60 | Build with Lumen | Your knowledge. Your models. One Lumen API. |

Copy follows the main-branch README, RAG service README and the current build
brief’s API and routing contracts. The router is rule-based; no learned routing,
accuracy benchmarks, savings, production-readiness or pricing claims are made.
Example questions are illustrative, not recorded provider responses.
Models are ordered primary/backups **inside** each of the two tiers; the video
does not promise cross-tier failover when an entire tier fails.

## Check or export

```sh
npm run typecheck
npm run lint
npm run build

# Optional MP4 export; not produced automatically during preview creation.
npm run render -- --browser-executable=/usr/bin/chromium

# Optional full-resolution still.
npm run still -- out/poster.png --frame=100 --browser-executable=/usr/bin/chromium
```

The browser flag uses the Chromium installed in this cloud environment. Omit it
on another machine to use Remotion’s browser, or supply a local Chromium path.
Exports go into the ignored `out/` directory. No Lumen API, RAG server, database,
Hugging Face download, or running production service is needed to preview this video.

Verification: TypeScript, Remotion ESLint and bundle succeeded. Remotion loaded
the compositions with system Chromium; representative full-resolution stills
were inspected for all five scenes. Studio loaded the main composition and
reported 01:00.00 with no browser exceptions. The generated score is exactly
60 seconds. Final MP4 export is intentionally left for an explicit export request.
