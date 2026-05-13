# Insight rule specs

One markdown spec per recommendation rule. **No rule ships without one.**

## Required sections per spec

1. **Entity counted** — what does "X" in the card title actually mean, in one plain-English sentence?
2. **Trigger conditions** — the threshold logic
3. **Edge cases enumerated** — must explicitly address: model switches mid-session, default-Sonnet behavior, agent column semantics, per-model pricing, time-window choice
4. **Validation** — list ≥3 real sessions from the local DB the rule was dry-run against, with the rule's output for each
5. **What we claim vs what we don't** — bound the card's interpretation
