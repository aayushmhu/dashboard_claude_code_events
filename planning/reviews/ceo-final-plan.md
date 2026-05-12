# Final Action Plan — Claude Code Activity Dashboard

**Author:** CEO
**Date:** 2026-05-12
**Inputs:** ceo-analysis.md, designer-review.md, new-user-review.md (raw), pm-review.md (did not land — gaps inferred)
**Audience:** the engineer who will execute this in the next 90 days.
**Path note:** intended at `.claude/reviews/ceo-final-plan.md`; landed here because `.claude/` is sandbox-guarded for writes — same block the designer review hit. `mv` it if you want it under `.claude/`.

---

## TL;DR

Three reviewers, one product, broadly aligned on the same diagnosis: **the engineering is ahead of the strategy.** The dataset captured by the logger and the diff-rendering inside the conversation view are the only genuinely differentiated assets. Everything else is replicable.

We will do three things that 10x the product and explicitly defer three things that won't. We will resolve one real disagreement (kill `/chat` vs. lead with it) by splitting the page in two and keeping only what no one else can ship.

---

## The Top 3 — these 10x the product

### 1. Fix the cost math. Per-model pricing, everywhere. *(1–2 days. Existential.)*

`lib/utils.ts:calcCost()` hardcodes Sonnet rates (`$3 / $15 / $3.75 / $0.30` per M). The schema already stores `model` on every event. Result today:

- Opus sessions show costs **5× understated**
- Haiku sessions show costs **~2.5× overstated**

For a product whose primary wedge is cost visibility, wrong dollars are worse than no dollars. This is the only finding in the entire review pile that is unambiguously a *bug in the value proposition*, not a polish item. **Ship this first, ship this Monday.**

What "done" looks like:
- `TOKEN_PRICING` becomes `TOKEN_PRICING[model]` keyed by Opus / Sonnet / Haiku / Sonnet-4.x / etc.
- `calcCost(input, output, cacheWrite, cacheRead, model)` — model required, no fallback.
- All API routes (`/api/tokens`, `/api/tokens/timeline`, `/api/stats`, `/api/sessions`) aggregate cost in SQL or in-route using per-row model, never a flat rate.
- Add one regression test per pricing tier.

### 2. One-command install. Drop MySQL for solo users; ship SQLite + a CLI bootstrapper. *(1–2 weeks. Distribution-defining.)*

The current install is 10 manual steps including `mysql_secure_installation`, hand-authoring `~/.claude/settings.json` with 7 hook entries, hardcoding a DB password in a Python script copied into the home directory, and `chmod 700`. The new-user review didn't even reach setup; the CEO review called this "the five-hour wall between curiosity and value." No product survives that.

The unlock:
- **SQLite as default** for solo installs. Keep MySQL as an opt-in for multi-user later. The hot queries (`stats`, `tokens`, `events/timeline`) don't need MySQL features we use.
- **`npx claude-dashboard init`** (or a Homebrew tap) that: writes `~/.claude/log-to-db.py` with a per-user secret keyed via OS keychain (no plaintext password), registers all 7 hooks in `~/.claude/settings.json`, runs migrations against `~/.claude/dashboard.db`, prints the dev URL.
- Kill the `time.sleep(0.3)` in the logger — replace with a small retry loop on file size stability. That race condition is a bug, not a workaround.

Without this we never get past the author + ~50 friends. With it, every cost-conscious Claude Code user is a single command away from being a daily-active user.

### 3. Lean into the conversation view as a *debugger*, not a chat clone. *(1–2 weeks. The moat.)*

This is the one real disagreement in the review pile, so read §"Disagreements" below first. Verdict: the **read-only replay** is the moat; the **live interactive `claude -p` subprocess** is not. Invest in the former; rip out or hide the latter.

Surface the data that's already captured in `cc_transcript_records` and that nobody else's tool shows:

| Signal | Where in schema | Render as |
|---|---|---|
| Permission denials | `record_type=rejected` | Red-bordered card inline ("You denied `Bash(rm -rf)` at 3:42pm") |
| Mode changes | `permission_mode` per record | Thin colored strip above the thread (ask / acceptEdits / bypass) |
| Compact boundaries | `record_type=compact_boundary` | Horizontal divider with saved-token count |
| Thinking blocks | `record_type=thinking` | Collapsed by default, one-line summary, click to expand |
| API errors | `record_type=api_error` | Separate "API errors" lane on `/errors`, distinct from tool errors |
| Per-turn cost | computed from tokens | `$0.03` muted right-aligned next to each assistant turn |
| Inline images | `cc_transcript_records.content_image` | 240px thumbnail, click to expand |

Plus the two product-shape changes:
- **Copy-patch button** on diff hover. Highest single-feature ROI in any code-review UI.
- **Session sharing** — generate a single read-only HTML export. This is the viral mechanic that turns one user into a team.

Everything in this bucket uses data the logger already captures. No new schema, no new ingestion. Pure UI exposure of existing signal — which is exactly the kind of bet that compounds.

---

## The Top 3 Nice-to-Have — defer until the above is shipped

These are real improvements. They are not what determines whether this becomes a product. **Do them in Q3, not now.**

### N1. Dashboard rebuild around a narrative header. *(Designer's #1.)*
Replace the 4-stat-card row with a one-sentence header ("Today: 12 sessions · $4.21 spent · 1 error"), three sparkline cards (spend / cache savings / error rate), and one stacked-activity hero chart. The new-user review confirms the current dashboard reads as jargon-heavy. **Worth doing, won't change conversion.** Real users come back for `/tokens` and the conversation view; the home is just the front door.

### N2. New-user tooltips, glossary, time-window labels. *(New User's #1.)*
Add `?` icons for "events", "cache efficiency", "entrypoint", "agent". Label every chart with its time window. Explain why cache_write costs more than input. Fix the duplicated page-number on `/sessions`. Add search + sort to `/sessions` and `/projects`. Group `/errors` by message hash. All of this is right, none of it 10xs. Bundle into one "polish sprint" and ship together.

### N3. Visual system pass — sidebar de-costuming, color-collision fixes, chart cleanup. *(Designer §1, §2, §9.)*
PreToolUse/PostToolUse share `#F59E0B`. Notification === system grey. Task* triplet collapses to one purple. Sidebar has four active-state cues stacked. Dark-mode shadow nuked to `none`. All true, all small, all *after* the dollar numbers are correct and the install works.

---

## Disagreements between reviewers — and the verdict

### Disagreement 1: Kill `/chat` or lead with it?

- **CEO**: Kill it. 2,596 lines of client + 1,138-line tool-call card = 40% of the codebase serving the question "why would a Claude Code user open a browser to use Claude Code?" The CLI is strictly better at the interactive part.
- **Designer**: "This is the product. Treat it accordingly." Lead the router default with it.

**Verdict: both are right about different halves of the same page.** The page does two unrelated things:
1. **Read-only replay** of past sessions with diffs, thinking blocks, tool cards. *This is the moat. Designer is right.*
2. **Live interactive `claude -p` subprocess** with Monaco editor and file tree. *This is the costume. CEO is right.*

**Action:**
- Split the page. Rename the read-only replay to `/conversations` and make it the default landing page after `/`.
- Move the live interactive surface to `/chat`, mark it experimental, and stop investing in it. Don't kill it tomorrow — it's already shipped — but no new features, no maintenance beyond keep-the-lights-on, and the next time it breaks during a Claude Code SDK change, we let it stay broken for a week before deciding whether to fix.
- If three months from now nobody complained that `/chat` was broken, delete it. Recover the 40% surface area.

### Disagreement 2: SaaS pivot vs. beloved OSS tool?

CEO analysis offers two paths; the designer and new-user reviews don't engage with business model. **Verdict: not a decision for this plan.** Do the three 10x items first. They are required for either path. We will revisit positioning in 90 days when we have install data.

### Disagreement 3: What should `/tokens` show at the top?

- Designer: kill the "Excl. Cache" column from the dashboard strip; keep it on `/tokens`; add a hero "You saved $X with cache" number.
- New user: the "Excl. Cache" footnote-at-the-bottom is confusing; the cache_write rate looks like a penalty.

**Verdict: aligned, not a real conflict.** Move "Excl. Cache" to `/tokens` only with a header tooltip; add the cache-savings hero on `/tokens` with one sentence of context for why cache_write costs more. Roll into N2.

### Where the PM gap leaves us blind

PM review never landed. Designer inferred 10 PM-type gaps from the schema; CEO inferred onboarding/distribution gaps from the install flow. Between them we have enough — but we are **not** seeing one perspective: which features are *missing entirely* from the schema. If there is a Claude Code event surface we are not capturing, no reviewer flagged it. **Owner: re-run the PM review before Q3.**

---

## What we will NOT build

Stated explicitly so the team can push back if the wind shifts:

- **Multi-tenant / team features.** Not until 1,000+ solo installs.
- **VS Code extension.** The dashboard's value is the data product; an IDE surface dilutes the focus.
- **More charts.** Information saturation is already high. Every new chart needs to displace an existing one.
- **Alerts and budgets.** Real, but a Q3 problem. Cost math first.
- **A recommendations engine ("you could save $X by using Haiku").** This is genuinely the long-term value, but it needs (a) correct per-model cost math, (b) a real install base to train rules against. Comes after the top 3.

---

## 90-day schedule

| Weeks | Ship |
|---|---|
| 1 | Per-model cost math + regression tests. *(Top 3 #1)* |
| 2–3 | SQLite default + `npx claude-dashboard init` + keychain secret + hook auto-registration. *(Top 3 #2)* |
| 4–6 | Conversation-view upgrades: rejections, mode strip, compact boundaries, thinking-collapse, per-turn cost, copy-patch, session HTML export. *(Top 3 #3)* |
| 7 | `/chat` split: rename read-only to `/conversations`, demote live to experimental. |
| 8–9 | Polish sprint: tooltips, glossary, time-window labels, sort/search on sessions+projects, error grouping. *(N2)* |
| 10–11 | Dashboard narrative redesign. *(N1)* |
| 12 | Visual system pass: colors, shadows, sidebar, chart cleanup. *(N3)* |

---

## What success looks like at day 90

- Cost numbers on the dashboard are correct to the cent against Anthropic's own billing.
- A new user gets from `brew install` (or `npx`) to a populated dashboard in under 60 seconds.
- The conversation view shows at least three signals (rejections, mode changes, compact boundaries) that no other Claude Code tool shows.
- One person on the team has sent a shared session HTML to someone else and gotten useful feedback. (Internal proof of the viral mechanic.)
- `/chat` interactive mode either has been deleted or has measurable weekly active users above some bar we set in week 7. No middle ground.

If we hit those, the next decision — beloved OSS vs. cost-optimizer SaaS — becomes informed instead of speculative. That is the only decision worth deferring.
