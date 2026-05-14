# Rule: cache-write-without-read

## Entity counted
**Sessions** in the last 30 days that paid the prompt-caching write premium (`cache_creation_tokens > min_writes`) but barely read from cache (`cache_read_tokens < min_reads`). The premium was wasted — caching only pays off when you read back later.

## Trigger conditions
- ≥ `cache_write_no_read_min_sessions` (default 3) such sessions in 30 days
- Per-session: `cache_creation_tokens >= 5000` AND `cache_read_tokens < 500`

## Edge cases addressed
- **Short sessions:** Skip if the session has < 3 turns — caching pays off across turns; a 1-turn session can't legitimately reuse cache.
- **Cost framing:** Saving estimate = (cache_creation_tokens × ($cache_write - $input_rate)) — the cache_creation premium they paid without benefit.

## What we claim
*"X sessions wrote to cache but never read back — paid the +25% premium for nothing."*
