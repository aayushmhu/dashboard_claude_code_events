# Session Handoff

> Compact handoff document. Updated at the end of every session; the next session reads this first.

## Verified Now

State the user-visible behaviors and infrastructure that are currently confirmed working, with evidence.

- **Harness-engineering methodology fully adopted.** `AGENTS.md` at root is the entry point (project overview + run commands + 15 hard constraints). `CLAUDE.md` is the architecture detail reference (222 lines). All 6 live harness artifacts at root (`feature_list.json`, `claude-progress.md`, `session-handoff.md`, `clean-state-checklist.md`, `evaluator-rubric.md`, `quality-document.md`).
- **`.claude/skills/harness-engineering/SKILL.md` exists** (145 lines) distilling lectures 03/04/05/07/09/11/12. CEO assigned the skill via frontmatter and designated custodian.
- **8 active agents** in `.claude/agents/`: ceo, team-lead, engineer, insights-engineer, ui-ux, pm, new-user (Haiku), claude-dev-guest (Sonnet). Each has crisp "What you do NOT do" + "When you find yourself out of scope" sections. Two legacy orphans (`ui-designer.md`, `product-manager.md`) deleted.
- **Phase 8 product work shipped + on origin/main**: prompt-anchored Session Summary (Phase 1 + 1.1), Project Detail rebuild (dynamic header, cost timeline, paginated sessions with session-id column, side-by-side Top Tools + Agents Used, colored error badges, agent badges), Tokens "Usage by Project" rows link to detail. Type-check clean. Verified visually via Playwright on audit session `0f018f00-...`.
- **Last green commit on origin/main**: `89a0131` (chore — remove dead code superseded by Phase 8). Remote: `aayushmhu/claude_dashboard`.
- **Docs reorganized** into `docs/planning/features/`, `docs/product/insight-specs/`, `docs/testing/`, `docs/requirement/`.
- **Planning file template** at `docs/planning/features/_TEMPLATE.md` has 8 sections including the new §6 "Files touched."

## Changed This Session (afternoon — infrastructure)

This session was 100% docs + agent prompts. **Zero code changes.**

- Created `AGENTS.md` (97 lines) as new entry point.
- Trimmed `CLAUDE.md` 318 → 222 lines (rules moved to AGENTS.md per single-source-of-truth Rule 14).
- Added 4 rules + consolidated 2 → expanded ruleset 11 → 15 rules in 7 categories.
- Created `.claude/skills/harness-engineering/SKILL.md` + wired CEO as custodian.
- Created `.claude/agents/claude-dev-guest.md` (8th agent — ecosystem-fit audit).
- Downgraded `.claude/agents/new-user.md` to Haiku.
- Added "What you do NOT do" + "When you find yourself out of scope" sections to all 6 existing agents.
- Updated CEO org chart to show operational team + audit roles separately.
- Fixed 11 broken markdown link references (memory file links → backtick).
- Replaced all `/Users/aayushsaini/...` absolute paths with `~`/relative across 9 files.
- Fixed 9 stale `CLAUDE.md Rule N` references → `AGENTS.md Rule N` across 7 files.
- Fixed `insights-engineer.md` staleness ("Twelve specs / 14 rules / under it" → "15 / 15 / HIT").
- Updated `README.md` clone URL + added 3 missing routes.
- Created planning file `docs/planning/features/2026-05-20-team-upgrade.md` (status: shipped, 7/7 test cases PASS).
- Added §6 "Files touched" to planning template.
- Deleted `ui-designer.md` + `product-manager.md` (orphaned legacy).

## Broken Or Unverified

Anything that could bite the next session.

- **CLAUDE.md still 22 lines over the 200-line cap.** Architecture/Pages/API/Components sections are dense. Next reduction needs `docs/product/architecture.md` + `docs/product/components.md` split. User has a plan; deferred.
- **`TOOL_COLORS` exported from both `lib/utils.ts` AND `lib/colors.ts`** — canonical is `lib/colors.ts`. Not breaking but should consolidate when convenient.
- **Uncommitted work** as of session end: this entire session (docs + agents + AGENTS.md/CLAUDE.md split). User explicitly requested commit confirmation at end-of-session. ~25 file changes pending.
- **Dev server stability**: if `npm run dev` fails with `NODE_MODULE_VERSION` mismatch, run `npm rebuild better-sqlite3` first. A stale Next.js process can hold port 3010 without responding; `lsof -i :3010` then kill if needed.

## Next Best Step

**summary-002** (Phase 1.2): bidirectional scroll + focus-event on conversations page.

The `↗` jump icon on prompt rows currently links to `/conversations/[id]#event-<id>` but the conversations page only loads ~50 latest events on mount. Deep jumps silently fail.

Approach already specced earlier in this conversation:
- Add `after_id` and `focus_id` params to `/api/sessions/[id]/events`
- Conversations client reads `?focus=<id>` on mount, fetches centered slice, scrolls + highlights
- Bidirectional IntersectionObserver (existing upward + new downward)
- Estimated ~45-60 min real engineering work

**Before writing code: per AGENTS.md Rule 5, create a planning file** at `docs/planning/features/2026-05-21-bidirectional-scroll.md` using `_TEMPLATE.md`. Fill §1 (verbatim requirement) + §2 (plan) + §3 (test cases) before any code is written.

## Commands

- Entry-point read: `AGENTS.md`
- Install: `npm install`
- Rebuild native modules if Node version changed: `npm rebuild better-sqlite3`
- Setup: `npm run init` (one-time)
- Dev: `PORT=3010 npm run dev`
- Type-check (L1): `npx tsc --noEmit`
- Lint: `npm run lint`
- Visual audit (L3): `node scripts/audit-page.mjs <url> $TMPDIR/<out-dir>` (Playwright)
- Live DB for dry-runs (L3 for insight rules): `~/.claude-dashboard/dashboard.db`
