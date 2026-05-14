# Rule: opus-verbose-output

## Entity counted
**Opus turns** in the last 30 days where `output_tokens > verbose_ratio × input_tokens`. Each Stop/SubagentStop event counts once.

## Trigger conditions
- `verbose_turn_count >= opus_verbose_min_turns` (default 10)
- Each turn must have:
  - `input_tokens > 500` — filters out the normal cached-conversation pattern where a tiny fresh prompt (5 tokens, after caching) yields a 1000-token response. That ratio looks huge but isn't verbosity.
  - `output_tokens > 2000` — filters out short replies regardless of ratio
  - `output_tokens > opus_verbose_ratio × input_tokens` (default 2.0×)

## Edge cases addressed
- **Model identity:** Filters on `model LIKE '%opus%'` only. Sonnet/Haiku output is much cheaper and verbose output there is less of a concern.
- **Input tokens excluded from cache_read:** "Input" in this rule means `input_tokens`, the freshly-supplied prompt. We deliberately don't include `cache_read_tokens` in the denominator — the rule is about whether Opus is producing too much output **relative to the new prompt content**, not the cached history.
- **Saving estimate:** If output were halved (e.g., via "be concise" system prompt), savings ≈ `0.5 × verbose_output_tokens × $75/M`. Stated assumption in `savingSubtext`.
- **Time window:** Last 30 days.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Pre-fix bug caught:** Initial validation showed 356 "verbose" turns with `avg_ratio = 390:1`. That's the normal cached-conversation pattern (tiny fresh prompt + standard response), NOT verbosity. **Without the `input>500` / `output>2000` gates, this rule would fire on every active user as a false positive.**
- [x] **After fix:** 1 turn matches (ratio 50:1 with substantive input). Below the 10-turn threshold → rule correctly stays silent.
- [x] **Saving estimate:** Bounded by `0.5 × output × $75/M` (Opus output rate). Stated assumption surfaced in card subtext.

## What we claim vs what we don't
- **Claim:** Opus turn output is N× larger than input on `X` turns. If average were halved, ~$Y saved.
- **Don't claim:** That the output was unnecessary. Sometimes verbose is correct (long analyses). The recommendation is "investigate whether you can prompt for concision."
