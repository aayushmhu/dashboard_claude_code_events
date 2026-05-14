# Rule: daily-cost-spike

## Entity counted
**Days** in the last 14 days where the day's cost was `>= cost_spike_ratio` times the trailing 7-day rolling average ending the day before the spike. One spike day = one card.

## Trigger conditions
- ≥1 spike day in the last 14 days
- The spike day's cost > `cost_spike_min_baseline` (default $0.50) — avoids triggering on rounding noise when overall spend is tiny

## Edge cases addressed
- **Cold start:** Skip the first 7 days of data (insufficient baseline). The rolling 7-day window must have ≥3 days of data before we compute a ratio.
- **Multiple spikes:** The card surfaces the **single highest-ratio day** in the window, not all of them. Avoids spammy multi-card output during a noisy week.
- **Per-model cost:** Uses the `COST_SQL` CASE expression (Opus 5× Sonnet, Haiku rates) so an Opus-heavy day is correctly priced.
- **Baseline guard:** Without the `min_baseline` floor, $0.001 vs $0.0001 would trigger as "10× spike" — meaningless. The floor keeps signal high.

## Validation (dry-run against real DB, 2026-05-13)
- [x] **Real-data sanity:** Daily costs over last 14 days: `$1281 (May 13) · $682 (May 12) · $1829 (May 11) · $80 (May 10) · $84 (May 9) · $164 (May 8) · $84 (May 7) · $0 (May 6)`. Volatile.
- [x] **Trailing 7-day avg ending May 12:** `(682+1829+80+84+164+84+0)/7 ≈ $418`. May 13 ratio = `1281/418 ≈ 3.06×` → **fires** at default 3.0× threshold.
- [x] **Min baseline floor ($0.50):** the May 6 zero-cost day correctly drops out (doesn't dilute the average to NaN).

## What we claim vs what we don't
- **Claim:** On `<date>`, you spent `<$X>` — `<ratio>×` your usual `<$Y> /day` baseline.
- **Don't claim:** What caused the spike. The recommendation is "look at that day's sessions," not a diagnosis.
