# Quality Document

A quality snapshot for each product domain and architectural layer. Both agents and humans can use this document to quickly understand where the codebase is strong and where it needs work.

**Update cadence:** After each significant session, or before starting a new phase of work.

**Grading scale:**

- **A**: All verification passing, clean architecture, agent-legible, stable behavior
- **B**: Verification passing, mostly clean, minor gaps in legibility or test coverage
- **C**: Partially working, known gaps, some code areas hard for agents to understand
- **D**: Not working, or major structural issues

---

## Product Domains

| Domain | Grade | Verification | Agent Legibility | Stability | Key Gaps | Last Updated |
|---|---|---|---|---|---|---|
| Dashboard (/) | B | Manual visual; no automated tests | Good — clear component split | Stable | No automated test coverage. Stat cards / charts could drift if SQL changes silently. | 2026-05-20 |
| Projects + Project Detail | A | Manual visual + Playwright screenshots | Good — components extracted (CostMixRow, Pagination, CostByModel, CostTimeline) | Stable post-Phase 8 rebuild | None known. | 2026-05-20 |
| Sessions | B | Manual | Good | Stable | `showSessionId` prop is dual-purpose; could simplify if more views appear. | 2026-05-20 |
| Conversations replay | A | Manual + Playwright (focus mode) | Good | Bidirectional infinite scroll + focus-event (`?focus=<id>`) shipped 2026-05-21 (summary-002) | None known. | 2026-05-21 |
| Session Summary (panel + page) | A | Type-check + Playwright on audit session | Excellent — Phase 1 cleanup left 561 lines of focused code | Stable | None — dead "moments" code removed in commit `89a0131`. | 2026-05-20 |
| Chat (interactive) | C | Manual; experimental flagged in UI | Mixed — Monaco editor + streaming logic; complex | Functional but called *Experimental* in the page list | AskUserQuestion tool calls don't surface as interactive prompts; queued. | 2026-05-20 |
| Tools analytics | B | Manual | Good | Stable | Per-tool detail page (`/tools/[name]`) could share more components with `/tools`. | 2026-05-20 |
| Tokens | B | Manual | Good | Stable | Rows now link to project detail (Phase 8). | 2026-05-20 |
| Errors | B | Manual | Good | Stable, but only fires when errors exist | API errors lane (Phase 2.5) was on the old roadmap but never built; queued. | 2026-05-20 |
| Model pricing | A | Manual | Good — shared CostMixRow | Stable | None. | 2026-05-20 |
| Insights (rule library) | B | Live-DB dry-runs via `docs/testing/_AUDIT_2026-05-16.md` | Excellent — one spec per rule in `docs/product/insight-specs/` | 15 rules implemented, 11/15 dry-run verified | 4 rules still need dry-runs; `opus-verbose-output` spec doc has stale pricing (code is correct). | 2026-05-20 |

## Architectural Layers

| Layer | Grade | Boundary Enforcement | Agent Legibility | Key Gaps | Last Updated |
|---|---|---|---|---|---|
| API routes (`app/api/**/route.ts`) | A | All DB queries live here; client never touches `better-sqlite3` directly | Excellent — per-route handlers, well-typed response interfaces | None known. | 2026-05-20 |
| Server components (`app/**/page.tsx`) | A | Fetch via internal API; no inline DB access | Good | None known. | 2026-05-20 |
| Client components (`components/*.tsx`) | A | `'use client'` directives in place; client data via props or fetch() | Good | None known. | 2026-05-20 |
| Shared lib (`lib/*.ts`) | B | `lib/db.ts` is the SQLite pool; `lib/utils.ts` is formatters; `lib/colors.ts` is palettes | Good, with one wart | `TOOL_COLORS` is exported from BOTH `lib/utils.ts` and `lib/colors.ts`. Canonical = `lib/colors.ts`; consolidate when convenient. | 2026-05-20 |
| Hook logger (`scripts/log-to-db.py`) | B | Python script outside Next.js; writes via stdlib `sqlite3` | Adequate | Model + token columns only populated on `Stop`/`SubagentStop`. Any rule querying `PostToolUse` for those fields gets NULL — documented in `CLAUDE.md`. | 2026-05-20 |
| Migrations (`migrations/*.sql`) | A | Two SQL files; one source of truth | Good | None. | 2026-05-20 |
| Agent prompts (`.claude/agents/*.md`) | A | One file per role; self-improvement loops in each | Excellent | None. | 2026-05-20 |

## Change History

### 2026-05-20 (morning — Phase 8 product work)

- Changes: Phase 8 shipped (prompt-anchored Session Summary + Project Detail rebuild). Cleanup commit removed ~546 lines of dead moments code. Docs reorganized into `planning/product/testing/requirement/`. Harness-engineering artifacts adopted.
- Domains promoted: Session Summary B → A (after Phase 1 + 1.1). Project Detail B → A (after rebuild + side-by-side cards). Model pricing → A (CostMixRow extraction).
- Demoted: none.
- New gaps identified: bidirectional scroll on conversations (queued as `summary-002`); task-notification XML rendering (`summary-003`).
- Gaps closed: dead-moments architecture removed, dead `date-range-picker.tsx` removed.

### 2026-05-20 (afternoon — infrastructure + team upgrade)

- Changes: Full harness-engineering methodology adoption. AGENTS.md created as entry point; CLAUDE.md trimmed to architecture detail. Ruleset expanded to 15 rules in 7 categories. 8-agent team finalized with crisp boundaries. Harness-engineering skill created and assigned to CEO as custodian. Two orphaned legacy agents deleted. All broken file refs + absolute paths + stale rule references fixed across the whole repo.
- Domains promoted: Agent prompts layer **stays A** (boundaries + out-of-scope sections + skill assignment make this layer best-in-class). Insights (rule library) — content unchanged, but `insights-engineer.md` staleness fixed (spec count corrected to 15).
- Demoted: none.
- New gaps identified:
  1. `CLAUDE.md` is 222 lines (22 over the 200-line cap from Rule 14). Architecture/Pages/API/Components sections need to be split into `docs/product/architecture.md` + `docs/product/components.md` to get under the cap.
  2. `TOOL_COLORS` duplication between `lib/utils.ts` and `lib/colors.ts` still pending consolidation (noted but not addressed this session).
- Gaps closed:
  - Rules-as-doc-target ambiguity (which file owns the rules?) → AGENTS.md is canonical now.
  - Stale CLAUDE.md sections → Rule 2 now lists explicit audit checklist (6 sections to scan after every task).
  - Broken file refs across agent prompts → all 11 instances converted to backtick notation.
  - Absolute `/Users/aayushsaini/...` paths in docs → all replaced with `~` or relative paths; Rule 15 prevents recurrence.
  - Orphaned legacy agents (`ui-designer.md`, `product-manager.md`) → deleted.

### 2026-05-21 — Phase 1.2 bidirectional scroll shipped

- Changes: summary-002 shipped. New API params (`after_id`, `focus_id`), bidirectional scroll handler in conversations client, focus highlight via `[data-focused]` attribute, `↗` link from Session Summary now uses `?focus=`. One post-deploy fix landed same day (scroll-down snap-back via `lastScrolledFocusRef` gate, user-confirmed).
- Domains promoted: **Conversations replay B → A** (jump-to-event from Summary now works for any event, not just the latest 50; bidirectional scroll keeps memory of focus without snapping back).
- Demoted: none.
- New gaps identified: **Subagent dispatch tooling gap** — team-lead can't spawn engineer (Agent tool missing from subagent context). Worked around this session by CEO direct-dispatch. Needs proper fix.
- Gaps closed:
  - Bidirectional scroll on conversations (was `summary-002` gap on 2026-05-20).
  - Jump-from-Summary silently failing on far-back events.

### YYYY-MM-DD

- Changes:
- Domains promoted:
- Demoted:
- New gaps identified:
- Gaps closed:
