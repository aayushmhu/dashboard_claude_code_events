# Rule: file-read-thrashing

## Entity counted
**Files** (`tool_input.file_path` from `Read` PostToolUse events) that get read ≥`read_thrash_min_per_session` times within a single session. Aggregated across sessions to find files that thrash repeatedly.

## Trigger conditions
- ≥`read_thrash_min_sessions` (default 2) distinct sessions hit the per-session threshold
- Per-session threshold: `read_thrash_min_per_session` (default 5) — same file read 5+ times in one session

## Edge cases addressed
- **Tool input parsing:** `tool_input` is stored as JSON text. `json_extract(tool_input, '$.file_path')` extracts the path. Filters NULL paths.
- **Distinct sessions, not turn count:** Re-reading a file once per session is fine. The signal is *the same file is re-read within one conversation* — context drift or the model not trusting prior context.
- **Time window:** Last 30 days.
- **Cost framing:** Each re-read adds the file content to that turn's input tokens. Saving estimate is conservative — assumes 50% of re-reads could be eliminated via better state tracking.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Real-data sanity:** Top three thrashing files:
  - `app/chat/client.tsx` — read **247 times** across **3 sessions** (during this multi-session refactor; legitimate thrashing)
  - `components/tool-call-card.tsx` — 32 reads, 3 sessions
  - `app/page.tsx` — 29 reads, 2 sessions
- [x] **Fires correctly** at defaults (≥5 reads/session, ≥2 sessions). Surfaces the worst offender.
- [x] **Healthy single-read pattern:** Files read once per session are excluded by the per-session HAVING clause.

## What we claim vs what we don't
- **Claim:** `<file>` was read N times across M sessions. This is a re-read pattern, not normal usage.
- **Don't claim:** That the file was "important" or "wasted." The rule highlights an anomaly; the user reviews whether it's intentional.
