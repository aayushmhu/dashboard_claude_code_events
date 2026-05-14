# Rule: high-tool-error-rate

## Entity counted
**Sessions** in the last 30 days where the **tool error rate** exceeded a threshold — i.e., `SUM(is_error) / COUNT(*) >= rate_threshold` across all `PostToolUse` events in that session. Suggests environment misconfiguration, missing dependencies, or stale paths.

## Trigger conditions
- ≥ `high_error_min_sessions` (default 2) sessions affected
- Per-session: ≥ `high_error_min_tool_calls` (default 10) tool calls (avoid noise from short sessions)
- Per-session: error rate ≥ `high_error_rate_threshold` (default 0.30)

## Edge cases addressed
- **Filter out exploratory sessions:** Min tool-call gate prevents flagging "tried two things, both failed" as a chronic problem.
- **Cost framing:** Errored tool calls still incur turn + cache cost. Saving = (error_count × avg_tool_cost) per session.
- **Different from edit-retries / retry-loops:** This is overall rate across all tools. Loops are consecutive same-tool. Edit-retries is Edit-specific.

## What we claim
*"X sessions had tool error rates over Y% — usually means broken environment or stale state."*
