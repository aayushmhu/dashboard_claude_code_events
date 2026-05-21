# Session Handoff

> Compact handoff document. Updated at the end of every session; the next session reads this first.

## Verified Now

State the user-visible behaviors and infrastructure that are currently confirmed working, with evidence.

- **Phase 1.2 bidirectional scroll + focus-event shipped** (2026-05-21). Click `↗` on any Session Summary prompt row → conversation page opens centered on that event with brief amber-outline highlight. Scroll up loads older (existing, scroll anchor preserved). Scroll down loads newer (new). Stops polling when at latest/earliest. URL contract: `?focus=<event_id>`. Post-deploy snap-back bug fixed same day (lastScrolledFocusRef gate). User-confirmed in browser. Evidence: `$TMPDIR/bs-audit/focused-viewport.png`.
- **Harness-engineering methodology in place.** `AGENTS.md` is the entry point (15 rules in 7 categories). `CLAUDE.md` is architecture detail. 6 live harness artifacts at root. `.claude/skills/harness-engineering/SKILL.md` with CEO as custodian.
- **8-agent team** in `.claude/agents/`: ceo, team-lead, engineer, insights-engineer, ui-ux, pm, new-user (Haiku), claude-dev-guest (Sonnet). Each with crisp boundaries.
- **Earlier shipped + pushed**: Phase 8 (prompt-anchored Session Summary + Project Detail rebuild); docs reorganization; harness adoption; team upgrade. Last green commit on origin/main before this session: `327ce80`.
- **Live DB**: `~/.claude-dashboard/dashboard.db`. Type-check passing: `npx tsc --noEmit` exit 0.

## Changed This Session (2026-05-21)

- **Created** planning file `docs/planning/features/2026-05-20-bidirectional-scroll.md` (status: shipped). 11 test cases designed up-front per Rule 5.
- **Modified** 5 code files: `app/api/sessions/[id]/events/route.ts` (+70 new query params + UNION SQL), `app/conversations/client.tsx` (+123 bidirectional scroll + focus highlight + post-deploy fix), `app/conversations/[id]/page.tsx` (+3 reads `?focus=`), `components/session-summary.tsx` (-1 `↗` link now `?focus=`), `app/globals.css` (+6 amber highlight CSS).
- **Modified** docs: `CLAUDE.md` (Conversations view section), `feature_list.json` (summary-002 → passing with evidence; rules-audit-001 unblocked), `claude-progress.md` (new session entry).
- **Diagnosed + fixed** post-deploy bug (scroll-down snap-back) via `lastScrolledFocusRef` gate in client.tsx. User-confirmed working.
- **Logged action item**: team-lead can't spawn engineer (Agent tool not in their subagent context). Worked around by CEO dispatching engineer directly with team-lead's prepared brief. Needs proper fix.

## Broken Or Unverified

- **Subagent dispatch tooling gap** (NEW this session): team-lead's subagent context doesn't include the Agent tool, so they can't spawn engineer. Workaround used (CEO dispatch direct). Needs investigation — maybe spawned agents need a different tool inheritance config, or team-lead should use SendMessage to a pre-spawned engineer pool. Surface this to user next session.
- **CLAUDE.md** is ~227 lines, still over the 200-line cap from Rule 14. Architecture/Pages/API/Components sections need to be split into `docs/product/architecture.md` + `docs/product/components.md`. User has a plan; deferred.
- **`TOOL_COLORS` duplication** between `lib/utils.ts` and `lib/colors.ts` — canonical is `lib/colors.ts`. Not breaking but should consolidate.
- **Dev server stability**: if `npm run dev` fails with `NODE_MODULE_VERSION` mismatch → `npm rebuild better-sqlite3`. Stale Next.js process on port 3010 → `lsof -i :3010` + kill.

## Next Best Step

Pick one of two remaining `not_started` features (user-driven priority):

1. **summary-003** — render task-notification XML as readable rows. When agent task notifications arrive in the conversation (e.g., `<task-notification>...<summary>...</summary>...</task-notification>`), parse the embedded summary instead of showing raw XML. Same Session Summary surface as Phase 1.2 just shipped. Estimate: ~30-45 min. Planning file needed per Rule 5.

2. **rules-audit-001** — finish the rule library dry-run audit (4 of 15 rules remain). Insights-engineer territory. Each rule needs a live-DB dry-run against `~/.claude-dashboard/dashboard.db` to confirm it fires (or correctly stays silent) on real data. Update `docs/testing/_AUDIT_2026-05-16.md` with verdicts.

Before code in either case: **create the planning file** per Rule 5 at `docs/planning/features/2026-05-XX-<slug>.md`.

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
- Test the bidirectional scroll: `http://127.0.0.1:3010/conversations/0f018f00-4a24-4e1d-bf1a-aaa297d874a7?focus=8351`
