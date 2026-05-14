# Rule: opus-small-output

## Entity counted
**Opus turns** in the last 30 days where `output_tokens < min_output` despite a substantial prompt (`input_tokens > min_input`). Opus's value is depth of reasoning + nontrivial output — if it's producing tiny responses to large prompts, you're paying Opus rates for Sonnet-class work.

## Trigger conditions
- ≥ `opus_small_min_turns` (default 10) such turns
- Per-turn: `input_tokens >= 1000` AND `output_tokens <= 200`

## Edge cases addressed
- **Different from opus-trivial-tools:** That's about which tools were called. This is about the model's actual output volume.
- **Different from opus-on-research-tasks:** That's about whole-session work patterns. This is per-turn — even within a "writing" session, individual turns may not need Opus.
- **Saving estimate:** If those turns ran on Sonnet, savings ≈ `verbose_turns × avg_cost × 0.8` (Sonnet is 1/5 the rate).

## What we claim
*"X Opus turns produced tiny output (≤200 tokens) for substantial prompts. Sonnet handles short-output work at 5× lower cost."*
