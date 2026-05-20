# Rule: tool-error-retry-loops

## Entity counted
**Sessions** in the last 30 days that hit a "retry loop" — defined as ≥ N consecutive `PostToolUse` events for the same `tool_name` where `is_error = 1` and there's no intervening successful tool call.

## Trigger conditions
- ≥ `retry_loop_min_sessions` (default 2) sessions exhibit a loop
- Per-session loop: ≥ `retry_loop_min_consecutive` (default 3) consecutive failures of the same tool

## Edge cases addressed
- **Consecutive vs total:** This is *consecutive* failures — different from edit-retries (which counts total). A session with 10 alternating success/failure pairs doesn't qualify here.
- **Same tool, not same input:** Tracks `tool_name`, not the specific `tool_input`. A Bash failure followed by an Edit failure breaks the loop.
- **Cost framing:** Each retry burns a tool turn (cache + model time). Saving = N retries × per-turn average cost.

## What we claim
*"X sessions hit a retry loop — `<tool>` failed ≥3 times in a row before succeeding (or stopping)."*
