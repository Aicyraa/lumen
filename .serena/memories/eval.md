# Evaluation and isolation suite (tools/eval)

- `questions.csv` (43 rows: easy, hard, multi-document, unanswerable). `expected_answer` values are AGENT-DRAFTED from the 8 campus PDFs (`DRAFT_ANSWERS_REVIEW.md`), not yet verified by the human; `held_out` = 10 rows chosen by seeded rule (seed 20261024); `cheap_ok`/`expensive_ok` empty (Phase 6 only).
- `run_eval.py`: three setups (always cheap, always expensive, rule router via internal `force_tier`), judge `qwen/qwen3.8-27b`, resume state keyed by setup/tenant/query/answer/judge/grading-rule version, outputs git-ignored (`results.csv`, `verdicts.csv`, `.eval_state.json`); `.env` holds provider key and tenant id (never commit).
- Grading: unanswerable rows are correct when the answer is the not-found sentence; sources on it are counted separately (`unanswerable_with_sources`).
- Isolation suite `pnpm eval:isolation`: scratch DB + own API/rag + stub model + planted code words; 64 cross-tenant questions, 14 positive checks, 30 object checks; negative controls strip tenant predicates (combined, vector-only, keyword-only) and must detect leaks.
- Groq free tier: about 8K tokens/min and a daily token cap per model; 429 with long retry-after makes big requests fail while tiny ones pass.
