# Lumen project instructions

Read `docs/AI_BUILD_BRIEF.md` fully before application work. It is the authoritative
product brief, including hard rules, stack, contracts, phase boundaries, and
acceptance checks. Read `docs/PROJECT_WORKFLOW.md` for supporting workflow context
`docs/WEBSITE_GUIDE.md` for what each page and tab does, and `docs/DESIGN.md` before building any screen; the build brief wins if they
disagree. Do not start a build phase unless asked.

## Money comes last

Phase 7 (pricing) is the final phase. Before it, do not add prices, compute or
store a cost, or show any cost, savings, calculator or pricing figure or copy
anywhere (API, logs, dashboard, home page, eval). `usage.cost_usd` and
`request_logs.cost_usd` stay null, and `config.yaml` has no prices. Token counts
and latency are still recorded. Request, document and rate limits are not
money and stay in scope, read from environment variables.

## Agent team

The main session is the lead. Run a phase with the `lumen-phase` skill (for
example "run phase 1"). It delegates to the project agents in `.claude/agents/`:
`rag-engineer` (apps/rag-service), `api-engineer` (apps/api), `web-engineer` (apps/web),
`eval-engineer` (tools/eval) and the read-only `lumen-reviewer`. The lead
verifies acceptance checks itself and never merges or pushes without approval.
The team works test-first: a failing test is committed (`test:`) and shown red
before the code that makes it pass (`feat:` or `fix:`).

## Coding workflow

- Follow the project brief and current task; work one phase at a time.
- For broad codebase questions, query the current worktree's Graphify graph
  when it exists, then verify relevant symbols and source.
- Use Serena for symbols and references. Confirm its active root is this
  checkout before editing. Use native tools for config, builds, and tests.
- Use Ponytail to prefer existing helpers and small changes without dropping
  validation, error handling, accessibility, or tests.
- Refresh the local code graph after changes. Never share writable graph
  output or a stateful Serena server across different worktrees.
- A review does not authorize merge. Never merge without the user's approval.
- Report behavior changes, checks actually run, and anything still unverified.

## Available tools

Use the connected tools instead of guessing or relying on memory. Prefer them
over generic search or shell when they fit.

- **Context7**: before writing or changing code that uses a library, framework,
  SDK, API, or CLI, fetch current docs (`resolve-library-id`, then
  `query-docs`). Do this even for well-known libraries; versions drift.
- **Serena**: call `initial_instructions` first. Use it for symbol lookup,
  references, and symbol-level edits and renames instead of grep and manual
  edits.
- **Graphify**: see the graphify section below. Query before grepping.
- **Ponytail**: apply to every coding task (smallest complete change, reuse
  existing helpers).
- **Vercel MCP**: deployments, build and runtime logs, env vars, domains, and
  project settings. Inspect build logs for failed deploys and runtime errors
  for production issues. Never print secrets.
- **Supabase MCP**: inspect tables, advisors, and logs before schema changes;
  apply schema changes as migrations, not ad-hoc SQL. Load the `supabase` and
  `supabase-postgres-best-practices` skills before database, auth, or RLS work.
  Run security advisors after DDL changes.
- Confirm with the user before destructive or outward-facing actions on
  external services (deleting projects or branches, production deploys,
  rollbacks, migrations against production data).
- If a tool is unavailable or errors, say so and fall back to native tools.

## Setup-only verification

This repository initially contains descriptions, not application source.
Disposable tool probes may be generated locally for setup verification and
must be removed afterwards. They are not application implementation and must
not be committed. An empty code graph is not proof of application navigation.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
