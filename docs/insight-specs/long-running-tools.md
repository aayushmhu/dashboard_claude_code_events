# Rule: long-running-tools

## Entity counted
**Tool calls** (`PostToolUse` events) in the last 30 days where `duration_ms` exceeds the configured threshold. Each row in `cc_events` with a long duration counts once. We also bucket by `tool_name` to surface which tool is the worst offender.

## Trigger conditions
- `slow_call_count >= long_tool_min_calls` (default 5)
- `max_duration_ms >= long_tool_min_duration_ms` (default 60_000 = 60s)

Both must be true.

## Edge cases addressed
- **Per-tool roll-up:** the card surfaces the top tool by occurrence so the recommendation is actionable, not just "things are slow."
- **`duration_ms IS NULL`:** excluded — only counts events where duration was actually recorded (post-hook ran).
- **Time window:** last 30 days, matching the other recommendation rules.
- **Cost framing:** slow tools don't *directly* cost dollars, but the streaming connection stays open while the model waits. The card frames this as "wasted wall-clock + retry budget" rather than a precise $ figure.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Aggregate (last 30d):** 38 tool calls ≥ 60s. Top offender: `Agent` (36 calls, peak 12.6h). `Bash` second (2 calls, peak 2m). → Rule **fires** at the default 5-call threshold.
- [x] **Peak duration sanity check:** the 12.6h Agent call is a real outlier (long-running agent task) and surfaces correctly as the "peak."
- [x] **`Read`/`Glob`/`LS` calls:** Excluded by `duration_ms < 60s` — these complete fast and don't pollute the count.

## What we claim vs what we don't
- **Claim:** N tool calls exceeded the duration threshold. Worst offender is `<tool_name>` at `<max_seconds>`s.
- **Don't claim:** A specific dollar saving. The link from latency to spend is real but indirect.
