# Clean State Checklist

> Run through this checklist at the end of every session. The repository should pass all six items before the session is considered "done."

- [ ] The standard startup path still works.
- [ ] The standard verification path still runs.
- [ ] Current progress is recorded in the progress log (`claude-progress.md`).
- [ ] Feature state in `feature_list.json` reflects what is actually passing versus unverified.
- [ ] No half-finished step is left undocumented.
- [ ] The next session can continue without manual repair.

## Repo-specific commands for each check

| Check | Command |
|---|---|
| Standard startup path | `npm install && npm run init && PORT=3010 npm run dev` |
| Standard verification path | `npx tsc --noEmit` (and `npm run lint` if touched lint-sensitive files) |
| Live data sanity check | `sqlite3 ~/.claude-dashboard/dashboard.db "SELECT COUNT(*) FROM cc_events;"` (non-zero = logger reaching DB) |
| Visual sanity check | `node scripts/audit-page.mjs http://127.0.0.1:3010/ $TMPDIR/audit` (smoke: home page renders) |

## Common dirty-state symptoms

If any of these are true, the checklist is **not** passing:

- `better-sqlite3` `NODE_MODULE_VERSION` error on dev server start — run `npm rebuild better-sqlite3` first
- A stale Next.js process holds the port — `lsof -i :3010` then `kill -9 <pid>` and retry
- Uncommitted changes the next session won't recognize — either commit or document in `session-handoff.md` under "Broken Or Unverified"
- `feature_list.json` says a feature is `passing` but evidence array is empty — fix or downgrade to `in_progress`
