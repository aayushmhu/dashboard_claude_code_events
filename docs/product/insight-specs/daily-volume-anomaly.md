# Rule: daily-volume-anomaly

## Entity counted
**Days** in the last 14 days where the day's **event count** (Stop + SubagentStop) was ≥ `volume_spike_ratio` × the trailing 7-day rolling average. Volume-based companion to `daily-cost-spike` — fires when Claude was much more active than usual, regardless of cost.

## Trigger conditions
- ≥ 1 such day in last 14 days
- Day's event count > `volume_spike_min_baseline` (default 50 events) — avoid noise on tiny totals

## Edge cases addressed
- **Distinct from cost spike:** A high-volume day on Sonnet might NOT be a cost spike; a high-cost day might be one giant Opus turn. Volume catches the "many turns" pattern specifically.
- **Cold start:** Trailing average needs ≥ 3 data points; otherwise skip.
- **Picks highest-ratio day only:** Avoids multiple cards from a noisy week.

## What we claim
*"On `<date>`, you had X events — `<ratio>`× your usual baseline of Y/day."*
