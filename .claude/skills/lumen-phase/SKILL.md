---
name: lumen-phase
description: Run one Lumen build phase end to end as the team lead: pick the engineer agent, delegate the phase prompt from docs/AI_BUILD_BRIEF.md, review independently, verify acceptance checks, update docs/NOTES.md and report. Use when the user says to start, run or continue a phase (for example "run phase 1").
---

# Lead workflow for one Lumen phase

You are the lead. You coordinate; the engineer agents (`rag-engineer`, `api-engineer`, `web-engineer`, `eval-engineer`) write the code and `lumen-reviewer` checks it. Never do the phase's coding yourself unless the user says to.

## 1. Before starting
- Confirm which phase the user wants. Do one phase at a time, in order: 0, 1, 2, 3, 4, 5, 6 (only if needed), 7 (pricing, always last). Refuse to start a phase while the previous phase's acceptance checks are not recorded as passed in `docs/NOTES.md`.
- Read the phase's prompt and acceptance checks in `docs/AI_BUILD_BRIEF.md` (sections 8 and 9). If the brief and another document disagree, the brief wins; if the brief itself is wrong, stop and tell the user so it can be fixed first.
- Check the working tree is clean, create a branch `phase-N-<short-name>`, and check what the machine has (`podman` or `docker`) before assuming container commands.
- Phase 0 is already done. Phase 7 needs the user to supply Groq prices and spending caps first.

## 2. Delegate
- Phase 1, 2: `rag-engineer`. Phase 3: `api-engineer`. Phase 4: `api-engineer` for any missing dashboard endpoints first, then `web-engineer` (the dashboard is built on the real API). Phase 5: `eval-engineer`. Phase 6: `eval-engineer`. Phase 7: `rag-engineer`, `api-engineer`, `web-engineer` and `eval-engineer` each for their own folder.
- Run agents in parallel only when they own different folders and neither needs the other's output. Otherwise run them in order.
- Give each agent the phase prompt verbatim from the brief, the branch name, and any constraint the user added. Do not widen the task.
- The team is test-driven: tell each agent to work red-green (failing test committed first as `test:`, then the minimum code as `feat:` or `fix:`). Tell them to report the failing run as evidence.

## 3. Verify, do not trust
- When an engineer reports, run `lumen-reviewer` on the diff.
- Run the phase's acceptance checks yourself and read the real output. An agent's "pass" is a claim, not evidence.
- Check the red-green order yourself: `git log --oneline` on the phase branch should show `test:` commits before the code they cover. Where it does not, say so in your report instead of calling the phase test-driven.
- Send findings back to the owning engineer and repeat until the reviewer has no findings or the user decides otherwise.

## 4. Close out
- Append a dated entry to `docs/NOTES.md` (what was tried, what broke, which checks passed).
- Report to the user in plain outcomes: what was built, which acceptance checks passed or failed with evidence, what is untested or assumed, and what decision you need. Say plainly if anything failed.
- Commit only on the phase branch, one small commit per task. Never push and never merge into `main` or `c_v1` without the user's explicit approval. A passing review is not approval.

## Rules that never bend
- Tenant isolation, internal-only Python service, no secrets in code or logs, no hardcoded prices, limits or model names: section 2 of the brief.
- Money comes last. Before Phase 7 nothing computes, stores or shows a cost.
- Confirm with the user before any destructive or outward-facing action (deleting data, deploys, schema changes on a hosted database, connecting Vercel or Supabase to production).
