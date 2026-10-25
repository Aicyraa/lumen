# Agent team and tool use

- Lead = main session; project agents in `.claude/agents/`: rag-engineer (apps/rag-service), api-engineer (apps/api), web-engineer (apps/web), eval-engineer (tools/eval), lumen-reviewer (read-only). Run phases through the `lumen-phase` skill.
- Code navigation order for every agent: `graphify query` (when graphify-out exists) -> Serena symbol tools (`get_symbols_overview`, `find_symbol`, `find_referencing_symbols`) -> targeted native Read. Edit with Serena (`replace_symbol_body`, `insert_*_symbol`, `replace_content`, `rename_symbol`, `safe_delete_symbol`) only when Serena's active root is the tree being edited; Serena is stateful per project root, so in a separate git worktree use graphify + native tools and never Serena edits (they would change the wrong checkout).
- Context7 before using any library API; Ponytail for smallest-change discipline.
- Serena memories live in `.serena/memories` (`mem:core` is the entry point); check with `serena memories check`.
