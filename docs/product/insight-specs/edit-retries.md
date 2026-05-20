# Rule: edit-retries

## Entity counted
**Sessions** (last 30 days) that had `>= edit_retries_min_per_session` failed Edit tool calls. A failed Edit = `PostToolUse` event where `tool_name = 'Edit'` and `is_error = 1`.

## Trigger conditions
- Per-session: `edit_count >= edit_retries_min_per_session` (default 3)
- Aggregate: `session_count >= edit_retries_min_sessions` (default 2)
- Both must be true.

## Edge cases addressed
- **Time window:** Last 30 days. Previously had no window — counted all-time failures, inconsistent with the other rules.
- **"Context drift" framing:** Softened to "often indicates context drift or stale context" — Edit failures can also be string-not-found from concurrent file changes, permission errors, or stale Read context. Not a definitive diagnosis.
- **Sonnet default / model switches:** Doesn't matter for this rule.
- **`is_error` semantics:** Only counts true errors; cancelled or aborted tool calls aren't counted.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Query result:** 0 sessions with ≥3 Edit failures in last 30 days. Rule correctly does not fire.
- [x] **Inference:** Either Edit is rarely failing, or large rewrites are being done via `Write` instead of `Edit`. Both scenarios make Rule 3 correctly silent — this is the desirable behavior.

**Conclusion:** Rule logic is sound. Cannot exercise the positive case against current data; recommend re-validating if Edit failures appear in future weeks.

## What we claim vs what we don't
- **Claim:** Pattern of repeated Edit failures in N sessions; suggest breaking work into smaller scoped tasks.
- **Don't claim:** That this caused the errors. The pattern is correlative — the advice (smaller edits) is generally good practice even if the diagnosis is wrong in a given case.
