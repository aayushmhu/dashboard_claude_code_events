# Evaluator Rubric

Use this rubric after implementation and before final acceptance of a feature. Score each row 0–2 (0 = absent / 1 = partial / 2 = clean), note specifics, then issue an overall verdict.

| Category | Question | Score (0-2) | Notes |
|---|---|---|---|
| Correctness | Does the implemented behavior match the requested feature in `feature_list.json`? | | |
| Verification | Did the required checks in the feature's `verification` array actually run, with evidence captured? | | |
| Scope discipline | Did the session stay inside the chosen feature scope? (No silent drift into other work.) | | |
| Reliability | Does the result survive restart or rerun without repair? Will the next session see the same state? | | |
| Maintainability | Is the code and documentation clear enough for the next session to understand without 20 minutes of archaeology? | | |
| Handoff readiness | Can a fresh session continue work from repo artifacts (`claude-progress.md`, `feature_list.json`, `session-handoff.md`) alone? | | |

## Verdict

- [ ] **Accept** — feature is shippable; mark `passing` in `feature_list.json`, commit, push (with user confirmation per AGENTS.md Rule #1)
- [ ] **Revise** — implementation is mostly right but specific gaps must close before acceptance (list in Required Follow-Up)
- [ ] **Block** — fundamental issue prevents acceptance; downgrade feature status to `blocked` and document the blocker in `claude-progress.md`

## Required Follow-Up

- **Missing evidence**: what verification couldn't be captured this session?
- **Required fixes**: what must change for re-evaluation?
- **Next review trigger**: what condition resumes evaluation? (e.g., "after engineer ships the API change for focus_id")

## Notes on use in this repo

- "Verification" almost always includes `npx tsc --noEmit` exit 0 and at least one Playwright screenshot when the change is visual.
- "Reliability" for this project includes: dev server starts cleanly via the standard path; the live DB query still returns expected rows; insight rules still fire on the audit session.
- "Handoff readiness" — the test is "can the next-session Claude continue without me explaining anything in chat?" If the answer is no, the rubric scores 0 here.
