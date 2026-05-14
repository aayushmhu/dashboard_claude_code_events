# Rule: prompt-caching-not-enabled

## Entity counted
**Sessions** in the last 30 days where `SUM(cache_creation_tokens) = 0` AND `SUM(cache_read_tokens) = 0` across all turns. The CLI either had caching disabled, or the prompt structure prevented it from being applied.

## Trigger conditions
- ≥ `no_caching_min_sessions` (default 3) such sessions
- Each session must have ≥ `no_caching_min_input` (default 50_000) **fresh input tokens** (otherwise caching wouldn't save much anyway)

## Edge cases addressed
- **Small sessions:** Filter out by min_input — caching saves <1% on tiny sessions.
- **Saving estimate:** If 70% of fresh input had been cached on subsequent turns, savings ≈ `0.7 × fresh_input × ($input_rate - $cache_read_rate)`. Stated in `savingSubtext`.
- **Why this is rare-but-valuable:** Most Anthropic SDK setups enable caching by default; this fires on legacy configs or manual integrations.

## What we claim
*"X sessions ran with prompt caching disabled — potential ~$Y saved if enabled."*
