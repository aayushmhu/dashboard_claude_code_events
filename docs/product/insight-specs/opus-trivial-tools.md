# Rule: opus-trivial-tools

## Entity counted
Opus **turns** (Stop or SubagentStop events with `model LIKE '%opus%'`) in the last 30 days, occurring in sessions whose tool usage was entirely lookup/shell tools (Bash, Read, Glob, LS, Grep, WebSearch, WebFetch). One Opus turn = one card unit of accounting.

## Trigger conditions
- `turn_count >= opus_min_turns` (default 5)
- `actual_cost > opus_min_cost` (default $0.10)
- Both must be true.

## Edge cases addressed
- **Sonnet default / mid-session switches:** Counting turns (not sessions) means a 90%-Sonnet session that briefly used Opus produces 1 unit of evidence, not a falsely-attributed "Opus session."
- **Per-model pricing:** Cost calc uses Opus rates ($15/$75/$18.75/$1.50 per M) for actual_cost, Haiku rates for the alternative. No mixing.
- **`agent` column:** Not used in this rule — main vs subagent doesn't matter for the cost claim.
- **Time window:** Last 30 days, matching Rule 2 and Rule 3.
- **Tool whitelist:** Bash, Read, Glob, LS, Grep, WebSearch, WebFetch. Excludes Edit, Write, Task, NotebookEdit and anything else needing reasoning.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Pure Sonnet, no opus turns** — `eb7fc7cf-6c5c-4ff4-b508-fa0f7e2c6558` (108 Sonnet turns, 0 Opus). Excluded by `model LIKE '%opus%'` filter. ✓
- [x] **Mixed Sonnet/Opus with Edit/Write/Agent** — `937a405d-3562-4912-9786-ad166dcbb729` (217 Opus turns, uses Write/Edit/Agent/etc). Correctly excluded by trivial-tools subquery. ✓
- [x] **Sonnet+Opus, trivial tools only** — `dca694ed-e0ed-44cf-85a3-642a8a999b66`, `ae905b19-2ec7-47ed-b1f2-267b2392689b` (1 Opus turn each). Match the rule but below default `opus_min_turns: 5` threshold — rule correctly does not fire at current defaults. ✓

**Conclusion:** Rule logic is sound. With current data the rule does not surface a card (which is correct — only 2 Opus turns in 30 days matched the pattern, below the 5-turn threshold).

## What we claim vs what we don't
- **Claim:** $X of Opus spend (at Opus rates) ran tasks Haiku could have handled. $Y avoidable at Haiku rates.
- **Don't claim:** That the user "wasted" the session. The user may have switched to Opus deliberately for a single hard thought; the rule is correlative, not prescriptive.
