# Rule: subagent-cache-miss

## Entity counted
**SubagentStop events only** in the last 30 days (one event = one subagent call). The previous version filtered `agent IS NOT NULL` which was always true — silently catching all main-agent turns. That's the critical bug this rule was rewritten to fix.

## Trigger conditions
- `call_count >= agent_min_calls` (default 5)
- `avg_input > agent_min_avg_input` (default 50k tokens)
- `cache_read / total_input < agent_max_cache_ratio` (default 30%)
- All three must be true.

## Edge cases addressed
- **Main vs subagent:** Filter is `event_type = 'SubagentStop'`. Main-agent Stop events are excluded.
- **Sonnet default:** Doesn't matter for this rule — cache mechanics are model-independent in pricing terms.
- **Savings math:** `uncached_input * 0.70 * (3.0 - 0.30) / 1e6`. Assumes 70% of currently-uncached input could be cached. Stated assumption surfaced in card subtext.
- **Cache-ratio formula (fixed during validation):** `cache_read / (cache_read + input + cache_creation)`. The previous formula divided `cache_read / (input + cache_creation)` — which excludes cache_read from the denominator and gives ratios over 100% on well-cached orchestrators (observed 2076% in real data). Fixed formula ranges 0–1 cleanly.
- **Time window:** Last 30 days. `last 30 days` is part of the card body — never claim "monthly" without stating the window.
- **`monthlySaving = (x * y / 30) * 30 * ...` bug:** Removed. The previous formula's `/30 * 30` cancelled, indicating copy-paste from an unrelated daily-rate calculation.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Aggregate (last 30d):** 252 subagent calls, avg 62.7k input, **95.4% cache reuse**. Cache ratio is well above the 30% threshold → rule correctly does not fire.
- [x] **Heaviest session:** `937a405d-3562-4912-9786-ad166dcbb729` — 109 subagent calls, 126k avg input, healthy cache reuse. Excluded individually by aggregate-level threshold check (cache ratio > 30%).
- [x] **Pre-fix bug caught:** Original cache_ratio formula showed **2076.7%** on real data. Fixed formula returns **95.4%** for the same data. This rule would have fired falsely on virtually every dataset before the fix.

**Conclusion:** Rule logic is sound after the formula fix. Currently does not surface a card (correctly — your orchestrator caching is healthy).

## What we claim vs what we don't
- **Claim:** If 70% of currently-uncached input were cached, ~$Y would be saved over 30 days.
- **Don't claim:** That enabling caching will definitely save $Y. The 70% assumption is conservative-ish but the actual hit rate depends on prompt structure.
