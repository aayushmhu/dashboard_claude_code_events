# Session Handoff

> Compact handoff document. Updated at the end of every session; the next session reads this first.

## Verified Now

- **`local-files-001` shipped** (2026-05-21 initial + 9 polish iterations 2026-05-21/22). Project Detail page bottom shows a "Local Files" card with MEMORY.md teaser (rendered markdown with click-to-navigate links), stats line, and two buttons. Dedicated `/projects/detail/local` page shows full memory list with View buttons → modal popup with full markdown preview + in-place navigation to other memory files via link clicks. `/chat?root=<claude-folder>` opens a focused file viewer: file explorer locked with amber `Local files: <slug> — Exit ↗` banner, MEMORY.md auto-opens in Monaco filling full width, no chat UI, no escape paths. Exit returns to Project Detail. Right-click on any file → "Download file". Markdown links in Preview mode resolve to actual files.
- **Phase 1.2 bidirectional scroll + focus-event shipped** (2026-05-21 earlier). Click ↗ on Session Summary prompt → conversation centered with amber highlight; bidirectional lazy-load.
- **Harness-engineering methodology in place** (2026-05-20). AGENTS.md is the entry point (15 rules in 7 categories). CLAUDE.md is architecture detail. 6 live harness artifacts at root. `.claude/skills/harness-engineering/SKILL.md` with CEO as custodian.
- **8-agent team** in `.claude/agents/`: ceo, team-lead, engineer, insights-engineer, ui-ux, pm, new-user (Haiku), claude-dev-guest (Sonnet).
- **Last green commit on origin/main**: `7c03ef0` (Phase 1.2 bidirectional scroll). `local-files-001` commit will be next.
- **Live DB**: `~/.claude-dashboard/dashboard.db`. Production build `npm run build` clean. Type-check `npx tsc --noEmit` exit 0.

## Changed This Session (2026-05-22)

- 4 post-deploy iterations on `local-files-001` (the 6th–9th):
  - Bumped chat preview cap 512 KB → 5 MB (`app/api/chat/filecontent/route.ts`)
  - Right-click "Download file" menu item added to existing context menu portal (`app/chat/client.tsx`)
  - Memory markdown links open in modal: in-place swap (modal) + URL navigation (teaser → dedicated page auto-opens) — affects `memory-preview-modal.tsx`, `local-files-section.tsx`, `local-files-client.tsx`, `local/page.tsx`
  - Chat Preview markdown links resolve to actual files via `openFileContent` (`app/chat/client.tsx`)
- Production build verified clean (`npm run build` exits 0 with all routes compiled).
- Continuity artifacts updated: planning file §7 has 9 post-deploy entries; this file; claude-progress.md.

## Broken Or Unverified

- **Subagent dispatch tooling gap** (persistent across sessions): team-lead's subagent context can't spawn engineer. CEO has been direct-dispatching engineer. Needs proper fix.
- **CLAUDE.md** ~25 lines over the 200-line cap from Rule 14. Architecture/Pages/API/Components sections need to be split into `docs/product/architecture.md` + `docs/product/components.md`. User has a plan; deferred.
- **`TOOL_COLORS` duplication** between `lib/utils.ts` and `lib/colors.ts`. Not breaking.
- **Dev server stability**: if `npm run dev` fails with `NODE_MODULE_VERSION` mismatch → `npm rebuild better-sqlite3`. Stale process on port 3010 → `lsof -i :3010` + kill.

## Next Best Step

Pick one (both `not_started` in `feature_list.json`):

1. **summary-003** — render task-notification XML as readable rows in Session Summary. Estimated 30-45 min. Planning file needed per AGENTS.md Rule 5.
2. **rules-audit-001** — dry-run the 4 remaining rules of 15 (insights-engineer territory). Each gets a verdict appended to `docs/testing/_AUDIT_2026-05-16.md`. Estimated 30 min per rule.

Either way, **create the planning file first** per AGENTS.md Rule 5 at `docs/planning/features/2026-05-XX-<slug>.md` using the template before any code.

## Commands

- Entry-point read: `AGENTS.md`
- Install: `npm install`
- Rebuild native modules if Node version changed: `npm rebuild better-sqlite3`
- Setup: `npm run init` (one-time)
- Dev: `PORT=3010 npm run dev`
- Type-check (L1): `npx tsc --noEmit`
- Production build: `npm run build`
- Lint: `npm run lint`
- Visual audit (L3): `node scripts/audit-page.mjs <url> $TMPDIR/<out-dir>`
- Live DB for dry-runs: `~/.claude-dashboard/dashboard.db`
- Try the new local files surface: `http://127.0.0.1:3010/projects/detail/local?project=/Users/aayushsaini/projects/dashboard_claude_code_events` (URL-encoded)
- Try the chat at the Claude folder: `http://127.0.0.1:3010/chat?root=<encoded ~/.claude/projects/-Users-aayushsaini-projects-dashboard-claude-code-events>&from=<encoded repo path>`
