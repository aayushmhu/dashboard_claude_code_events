# Rule: subagent-explosion

## Entity counted
**Sessions** in the last 30 days with an unusually high number of subagent (`SubagentStop`) events — suggesting Claude over-delegated when the main agent could have handled the work directly.

## Trigger conditions
- ≥ `subagent_explosion_min_sessions` (default 2) sessions
- Per-session: ≥ `subagent_explosion_min_calls` (default 20) subagent calls

## Edge cases addressed
- **Each subagent has cache-creation overhead:** Even with caching, every new subagent invocation pays the cache-write premium for the system prompt. 20 subagents in one session ≈ 20× system-prompt cache writes.
- **Different from subagent-cache-miss:** That rule is about cache reuse rate. This one is about raw call count.
- **Cost framing:** Saving estimate = `(extra_subagent_count × avg_subagent_cost)` where extra = above the rule threshold.

## What we claim
*"X sessions called subagents N times — each has its own cache overhead. Consider whether the main agent could handle some of this directly."*
