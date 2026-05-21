# Progress Log

## Current Verified State

- Repository root: `~/projects/dashboard_claude_code_events` (GitHub remote: `aayushmhu/claude_dashboard`)
- Standard startup path: `npm install && npm run init && PORT=3010 npm run dev` (default port is 3000; 3010 is local convention)
- Standard verification path: `npx tsc --noEmit` (L1 type-check, exit 0 — covers server + client); visual via `node scripts/audit-page.mjs <url> <out-dir>` (Playwright L3)
- **Entry point for any agent**: read [`AGENTS.md`](AGENTS.md) FIRST. Project overview + run commands + 15 hard constraints live there. `CLAUDE.md` is the architecture detail reference.
- Current highest-priority unfinished feature: **summary-003** (render task-notification XML as readable rows) OR **rules-audit-001** (4 of 15 rules remaining in dry-run audit). User picks priority.
- Current blocker: none
- Most recent shipped feature: **summary-002** (Phase 1.2 bidirectional scroll + focus-event) — landed 2026-05-21 with one post-deploy fix (scroll-down snap-back) resolved same day.

## Session Log

### Session 2026-05-21 (Phase 1.2 — bidirectional scroll)

- Date: 2026-05-21
- Goal: Ship `summary-002` (Phase 1.2 — bidirectional scroll + focus-event on conversations page) following AGENTS.md Rule 5 (planning before code).
- Completed:
  - Created planning file `docs/planning/features/2026-05-20-bidirectional-scroll.md` with 11 test cases designed up-front and §4 sign-off questions answered by CEO ("go with recommended").
  - Team-lead dispatched but hit a tooling gap (Agent tool not in their subagent set); escalated to CEO. CEO dispatched engineer directly this once with team-lead's prepared brief. Chain discipline preserved by content-identical brief; action item recorded in §5 to fix subagent tool availability for future dispatches.
  - Engineer shipped 5 file changes (+197 lines net): API route `after_id` + `focus_id` params with UNION SQL; ConversationsClient bidirectional scroll + focus highlight; Page reads `?focus=` searchParam; SessionSummary ↗ link uses `?focus=` instead of `#event-`; globals.css `[data-focused="true"]` amber outline.
  - L1 type-check exit 0 (engineer + CEO re-verified). L2 verified via curl (focus_id returns 27-event slice centered on 8351; after_id returns expected slice from id 8396; default load preserves `has_more_newer: false`). L3 verified via Playwright (event 8351 in viewport, centered, `data-focused` attr live at 800ms).
  - 11/11 test cases PASS: 6 via direct verification (Playwright + curl), 5 PASS-by-inspection on mechanical scroll behaviors.
  - One spec deviation documented: SQL UNION outer wrapper changed from `SELECT ${EVENT_SELECT} FROM (subquery)` to `SELECT * FROM (subquery)` because SQLite can't re-apply `json_extract(...)` to already-computed subquery columns.
  - **Post-deploy bug + fix (same session)**: user reported scroll-down snapping back to focused event after first new-events load. Diagnosed: focus useEffect deps included `events.length`, re-firing `scrollIntoView` whenever new events appeared. Fixed via `lastScrolledFocusRef` gate (+4 lines in client.tsx). L1 clean. User-confirmed in browser. Documented in planning file §7.
  - Updated CLAUDE.md Conversations view section (was "upward infinite scroll" → now describes bidirectional + focus mode).
- Verification run: `npx tsc --noEmit` exit 0 throughout (before fix, after fix, after CLAUDE.md update)
- Evidence captured: `$TMPDIR/bs-audit/desktop.png` + `focused-viewport.png` (Playwright screenshots); curl evidence in planning file §5
- Commits: in progress at session end (one commit for Phase 1.2 bundling initial implementation + post-deploy fix + planning file + feature_list.json + CLAUDE.md update). Earlier commits this session-set: `e75dc05` + `b4b3950` + `327ce80` (docs reorg + harness adoption + team upgrade — pushed 2026-05-20).
- Files or artifacts updated: see planning file §6 Files touched + git status for the full picture.
- Known risk or unresolved issue:
  - **Subagent tooling gap**: team-lead can't spawn engineer from within their subagent context (Agent tool not available). Worked around this session by CEO dispatching engineer directly with team-lead's prepared brief; investigate fixing properly for next session.
  - Pre-existing: `TOOL_COLORS` duplication between `lib/utils.ts` and `lib/colors.ts`; CLAUDE.md still ~22 lines over the 200 cap (mostly Architecture detail).
- Next best step: `summary-003` (render task-notification XML as readable rows) OR resume `rules-audit-001` (4 remaining rules to dry-run). User picks which is higher priority.

### Session 2026-05-20 (afternoon — infrastructure + team upgrade)

- Date: 2026-05-20
- Goal: Adopt harness-engineering methodology fully, upgrade the agent team, split CLAUDE.md → AGENTS.md, end-of-session hygiene.
- Completed:
  - Created `.claude/skills/harness-engineering/SKILL.md` distilling lectures 03/04/05/07/09/11/12 of the methodology; CEO assigned this skill via frontmatter; CEO designated as custodian.
  - Sharpened agent boundaries: added "What you do NOT do" + "When you find yourself out of scope" sections to all 6 existing agents (ceo, team-lead, engineer, ui-ux, pm, insights-engineer).
  - Created new agent `.claude/agents/claude-dev-guest.md` (Sonnet) — ecosystem-fit auditor distinct from `new-user`.
  - Downgraded `new-user` to Haiku (pure first-impression persona doesn't need deep reasoning).
  - Deleted two orphaned legacy files (`ui-designer.md`, `product-manager.md`) — never registered as agents, no frontmatter, predate the team structure.
  - Fixed CEO org chart to show 2-branch layout (operational team + audit roles).
  - Fixed 11 broken markdown link instances across 5 agent files (memory file links → backtick references).
  - Replaced absolute `/Users/aayushsaini/...` paths with `~`/relative paths across all 9 affected files.
  - Created planning file `docs/planning/features/2026-05-20-team-upgrade.md` (status: shipped, all TC-TU-01..07 PASS).
  - Added §6 "Files touched" section to `docs/planning/features/_TEMPLATE.md`.
  - **Expanded ruleset from 11 → 15 rules in 7 categories** (Commit / Scope / Planning / Schema / Completion / Session / File). Added: typecheck-both-sides, DB migration required, snake_case columns, planning file before code, trust continuity artifacts, record decisions, never use absolute paths, CLAUDE.md audit checklist.
  - **Created `AGENTS.md`** (97 lines) as the methodology-standard entry point. Contains project overview, run commands, 15 hard constraints, "what to read next" routing table.
  - **Trimmed `CLAUDE.md` from 318 → 222 lines** by removing the (now-AGENTS.md) Rules / Harness artifacts / Project / Commands sections.
  - Fixed all stale `CLAUDE.md Rule N` references → `AGENTS.md Rule N` across 9 instances in 7 files.
  - Fixed `insights-engineer.md` staleness ("Twelve specs / 14 rules / under it" → "15 / 15 / HIT").
  - Updated `README.md` with new clone URL (`claude_dashboard`) + 3 missing routes (Project Detail / Session Summary / Model Pricing).
  - Updated CEO team roster in CLAUDE.md to 8 agents with Model column + embedded org chart matching `ceo.md`.
  - Added `infra-001` feature to `feature_list.json` (status: passing) recording all this work.
- Verification run: `npx tsc --noEmit` not directly run this session (no code touched — docs only). Final wide-sweep grep audit clean for: `Twelve specs`, `14 rules already`, `we're under it`, `Eight pages`, old git URL, `/Users/aayushsaini`, `CLAUDE.md Rule`. ✓
- Evidence captured: planning file at `docs/planning/features/2026-05-20-team-upgrade.md` documents all 8 sections; final state of all 8 agent files + AGENTS.md + CLAUDE.md.
- Commits: NONE this session yet. User explicitly requested commit confirmation at end. Earlier commits `d4d7b75` + `89a0131` (yesterday's Phase 8 work) are pushed; this session's work (~25 file changes) sits uncommitted.
- Files or artifacts updated: extensive — see `docs/planning/features/2026-05-20-team-upgrade.md` §6 Files touched + `git status` for the full picture.
- Known risk or unresolved issue:
  1. `TOOL_COLORS` is exported from both `lib/utils.ts` and `lib/colors.ts` — canonical is `lib/colors.ts`. Consolidate when convenient.
  2. `CLAUDE.md` is 222 lines, still 22 over the 200-line cap from Rule 14. Architecture/Pages/API/Components sections are dense; the next reduction step is splitting them into `docs/product/architecture.md` + `docs/product/components.md`. User has a plan for this; deferred.
- Next best step: Pick up **summary-002** (Phase 1.2 — bidirectional scroll + focus-event on conversations page). Spec already in `feature_list.json` and earlier in this conversation. Estimate ~45-60 min real engineering work. Create the planning file first per Rule 5.

### Session 2026-05-20 (morning — Phase 8 rebuild + cleanup)

- Date: 2026-05-20
- Goal: Rebuild reverted work (Phase 1 + 1.1 + Project Detail), then reorganize docs, then adopt harness-engineering artifacts.
- Completed:
  - Rebuilt Session Summary Phase 1 (prompt-anchored moments) + Phase 1.1 (response excerpts) — `app/api/sessions/[id]/summary/route.ts` and `components/session-summary.tsx`
  - Rebuilt Project Detail page + API route (dynamic header, sub-header band, cost timeline, cost by model, paginated sessions w/ session-id column, side-by-side Top Tools + Agents Used, errors)
  - Tokens "Usage by Project" rows link to project detail
  - Removed ~546 lines of dead "moments" code in session-summary.tsx + route.ts (legacy architecture superseded by Phase 1)
  - Deleted orphan `components/date-range-picker.tsx`
  - Deleted `/planning` directory (May-13 artifacts, all superseded)
  - GitHub repo renamed `dashboard_claude_code_events → claude_dashboard`; local remote URL updated
  - CLAUDE.md updated to reflect current state (5 tables, 11 routes, Session Summary section, per-model pricing, agent team pointer)
  - Reorganized `docs/` into `planning/`, `product/`, `testing/`, `requirement/` subfolders
  - Adopted methodology artifacts from learn-harness-engineering: `feature_list.json`, `claude-progress.md` (this file), `session-handoff.md` at root; `clean-state-checklist.md` + `evaluator-rubric.md` in `docs/testing/`; `quality-document.md` in `docs/product/`
- Verification run: `npx tsc --noEmit` → exit 0 after each phase
- Evidence captured: Playwright screenshots at `$TMPDIR/summary-rebuilt/`, `$TMPDIR/rebuilt-project/`
- Commits: `d4d7b75` (Phase 8 — prompt-anchored session summary + project detail rebuild), `89a0131` (chore — remove dead code superseded by Phase 8). Subsequent work in this session (docs reorg, harness artifacts) is uncommitted pending user confirmation per AGENTS.md Rule #1.
- Files or artifacts updated: see git status for full delta
- Known risk or unresolved issue: `TOOL_COLORS` is exported from both `lib/utils.ts` and `lib/colors.ts` — same constant declared twice; canonical source is `lib/colors.ts`. Consolidate when convenient.
- Next best step: Pick up summary-002 (Phase 1.2). API route + client changes already specced in earlier conversation; ~45-60 min real work.
