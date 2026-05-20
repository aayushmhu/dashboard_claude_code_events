# AGENTS.md

> **Entry point for any agent working in this repository.** Read this first. Detailed architecture, page list, API routes, and component inventory live in [`CLAUDE.md`](CLAUDE.md).

## Project

A **Next.js 15 (App Router) dashboard** that visualizes Claude Code activity stored in a local SQLite database. A Python hook logger (`scripts/log-to-db.py`) captures every Claude Code event and writes it to SQLite; this dashboard reads and displays it.

**Product wedge**: *insights about Claude Code usage* — cost, waste, anti-patterns. Anything that doesn't advance that gets "no" or "later" by default.

**Audience**: solo power users using Claude as their primary AI coding tool (today). Internal team-developer tracking (future, deferred).

## Run commands

```bash
npm install                                       # install dependencies
npm run init                                      # one-time setup: copies logger, registers hooks, creates DB
PORT=3010 npm run dev                             # dev server (PORT=3010 is local convention; default is 3000)
npm run build                                     # production build
npm run lint                                      # ESLint
npm run start                                     # production server
npx tsc --noEmit                                  # L1 type-check (server + client in one pass)
node scripts/audit-page.mjs <url> <out-dir>       # L3 Playwright desktop + mobile screenshots
sqlite3 ~/.claude-dashboard/dashboard.db '<sql>'  # query live DB for rule dry-runs
```

**Recovery**: if `npm run dev` fails with `NODE_MODULE_VERSION` mismatch, run `npm rebuild better-sqlite3` first.

**Environment**: copy `.env.local.example` → `.env.local`. Three optional variables:
- `DB_PATH` — path to SQLite DB (default: `~/.claude-dashboard/dashboard.db`)
- `NEXT_PUBLIC_APP_URL` — base URL for server-side fetches (default: `http://localhost:3000`)
- `NEXT_PUBLIC_USER_NAME` — display name for actor labels in the UI (default: `"User"`)

## Hard constraints

These are the non-negotiable agent rules for this repo. Maximum 15. If you find one stale, update this file in the same commit that exposed the staleness.

### Commit discipline
1. **Never commit or push without explicit confirmation AND L1 type-check passing.** Run `git commit` and `git push` only when the user has explicitly asked in the current turn, and only after `npx tsc --noEmit` exits 0 — this covers both server-side (API routes, `lib/`, instrumentation) and client-side (pages, components) types in a single pass. Both sides must be clean before any push.
2. **Doc updates ride with code commits.** When a code change OR a structural change (new agent, new page, new API route, schema change, dependency added, shared component added) makes any of these out of date, the doc update goes in the *same* commit:
   - `feature_list.json` (status + evidence)
   - `claude-progress.md` (session log entry)
   - `quality-document.md` (per-domain grade if shifted)
   - the planning file in `docs/planning/features/` (execution log + Files touched)
   - `CLAUDE.md` and `AGENTS.md` themselves

   **CLAUDE.md audit checklist** — after every meaningful task, scan these sections and update if stale:
   - **Pages** table (new route → new row)
   - **API routes** list (new route → list it)
   - **Agent team** section (added / removed / model changed → reflect it)
   - **Database** section (new table or column → document the schema)
   - **Tech stack** line (new dependency → add it)
   - **Shared Components** list (new component used cross-page → mention it)

   Stale docs are more dangerous than no docs — they actively mislead the next session.

### Scope discipline
3. **Work on one feature at a time.** Pick the single highest-priority `not_started` or already-`active` feature from `feature_list.json` at the start of a session. Valid states are `not_started` / `active` / `blocked` / `passing`. **At most one feature** may be `active` at a time.
4. **No drive-by refactors.** Don't "also clean up X" while implementing feature Y. Surface unrelated work as a new feature in `feature_list.json`; don't bundle.

### Planning discipline
5. **Every new feature or significant modification gets a planning file BEFORE any code is written.** Path: `docs/planning/features/<YYYY-MM-DD>-<short-slug>.md`. Use [`docs/planning/features/_TEMPLATE.md`](docs/planning/features/_TEMPLATE.md) as the starting point. The file is the single timeline for that feature: verbatim requirement, plan, test cases designed up-front, execution log, files touched, and post-deploy issues with fixes. **Statuses**: `proposed` → `in-progress` → `shipped`. `shipped` is terminal. **Before any backend / frontend work OR when a user reports a bug, grep `docs/planning/features/` first** — if a related file exists, append to it; don't fix silently.
6. **Trust the continuity artifacts; do not re-explore.** When `claude-progress.md`, `session-handoff.md`, or a planning file in `docs/planning/features/` describes prior work, treat them as authoritative. Read them. Do not re-investigate territory those files already cover. If a file says "X is shipped and verified via Y" and you don't have evidence it's wrong, don't go re-derive X from the codebase — start from the file's stated state. If a file IS stale, fix the file and note the discrepancy in `claude-progress.md`; don't silently bypass it.
7. **Record decisions, not just code.** Any material design / product / architectural choice made during a session — picking pattern A over B, deciding to defer a feature, choosing a threshold value, accepting a known trade-off — must land in a file before session end. Put it in the active feature's planning file (Section 4 sign-off or Section 5 execution log), or in `claude-progress.md`'s "Known risk or unresolved issue" field. Decisions made only in chat are invisible next session.

### Schema discipline
8. **DB schema changes require a migration file.** Add a new `migrations/NNN_<description>.sql` for any schema change (new table, new column, type change, index). Never modify the schema via ad-hoc SQL on a running DB. Update the schema docs in `CLAUDE.md` in the same commit.
9. **Snake_case for every DB column name.** All columns in `cc_sessions`, `cc_events`, `cc_transcript_records`, `chat_sessions`, `settings`, and any future tables use `snake_case` (e.g., `total_tokens`, `cache_creation_tokens`, `is_error`). TS/JS code may map to camelCase at the API response boundary, but the column itself is always snake_case.

### Completion discipline
10. **Done means behavior verification passes with evidence captured**, not "code is written." Self-reported confidence is not evidence. Unit tests passing alone or type-check passing alone are not proof of completion. The feature's `evidence` array in `feature_list.json` must reference a real commit hash, screenshot path, or command output — empty evidence means status stays `active` or `blocked`. **Never silently change a feature's `verification` array during implementation** — if the verification no longer makes sense, update the array explicitly in the planning file and note the change in `claude-progress.md`.
11. **Three-layer verification, in order, no skipping:**
   - **L1 — Static**: `npx tsc --noEmit` exit 0 (and `npm run lint` if lint-sensitive files touched).
   - **L2 — Runtime**: standard startup path works (`PORT=3010 npm run dev`), the changed pages render, the changed API routes return real data.
   - **L3 — Integration**: live-DB SQL dry-run (for insight rules), Playwright screenshot (for visual changes), or end-to-end user path. Capture evidence as a file path or commit hash. Mocked-only success is NOT L3; the run must hit real data / real DOM / real DB.

### Session discipline
12. **At session start**: confirm `pwd`, read `claude-progress.md`, read `feature_list.json` and pick the next item, grep `docs/planning/features/` for relevant prior context, `git log --oneline -5`, run standard startup, run L1 verification. If L1 is already failing, fix it first — do not stack new work on a broken baseline.
13. **At session end, run [`clean-state-checklist.md`](clean-state-checklist.md).** All six items must pass before declaring done. Update `claude-progress.md`, `feature_list.json`, `session-handoff.md`, and the active feature's planning file in the same commit as the code change. **This applies even when stopping mid-feature** — if you ran out of context, hit a blocker, or are simply pausing, the continuity artifacts still get updated. "I'll do it next session" is not allowed.

### File discipline
14. **Keep AGENTS.md and CLAUDE.md ≤ 200 lines each, ≤ 15 rules in the Rules section here.** When a topic outgrows a few paragraphs, move it into `docs/` and link from here. The middle of long files gets ignored by both humans and agents — keep critical content at top or bottom. **One-way links only**: AGENTS.md and CLAUDE.md point outward (into `docs/`, `.claude/agents/`, `.claude/skills/`); referenced files don't duplicate content back. Single source of truth per topic.
15. **Never use absolute paths in documentation.** In any `.md` / `.json` / planning artifact, refer to files and directories using **relative paths from the repo root** (e.g., `docs/product/insight-specs/`, `lib/db.ts`, `.claude/agents/ceo.md`) or **home-relative paths with `~`** for user-specific locations outside the repo (e.g., `~/.claude-dashboard/dashboard.db`). Hardcoded `/Users/...`, `/home/...`, or other machine-specific absolute paths are forbidden — they break the moment the repo moves to a different machine or a teammate clones it. Source code already follows this via `os.homedir()` + `path.join()` in `lib/db.ts` / `instrumentation.ts`; docs must match.

## What to read next

| When | Read |
|---|---|
| First thing every session | [`claude-progress.md`](claude-progress.md), [`session-handoff.md`](session-handoff.md), [`feature_list.json`](feature_list.json) |
| Before backend / frontend work | grep `docs/planning/features/` for prior context |
| Architecture, pages, API routes, schema, components | [`CLAUDE.md`](CLAUDE.md) |
| Methodology (harness-engineering) | [`.claude/skills/harness-engineering/SKILL.md`](.claude/skills/harness-engineering/SKILL.md) |
| Per-role agent boundaries | [`.claude/agents/<role>.md`](.claude/agents/) |
| Insight rule library | [`docs/product/insight-specs/`](docs/product/insight-specs/) |
| Quality state per domain | [`quality-document.md`](quality-document.md) |
| End-of-session checklist | [`clean-state-checklist.md`](clean-state-checklist.md) |
| Post-implementation review rubric | [`evaluator-rubric.md`](evaluator-rubric.md) |
