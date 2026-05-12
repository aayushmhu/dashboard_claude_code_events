# Claude Code Dashboard — Phased Roadmap

> Synthesized from: CEO analysis, CEO final plan, UI/UX Designer review, PM gaps (inferred).
> Last updated: 2026-05-13
> Rule: complete each phase before starting the next. No cherry-picking from Phase 3 before Phase 1 ships.

**Status:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 → active

---

## Phase 0 — Fix the Lies ✅ COMPLETE
> **Goal:** The numbers the dashboard shows must be correct. Nothing else matters until they are.

These are bugs in the value proposition, not polish items. Ship these before showing this to anyone.

### 0.1 Per-model cost calculation
**What's broken:** `calcCost()` in `lib/utils.ts` hardcodes Sonnet rates for every model.
- Opus sessions show cost **5× understated**
- Haiku sessions show cost **~2.5× overstated**

**What to build:**
- `TOKEN_PRICING` becomes a map keyed by model family: `{ opus: {...}, sonnet: {...}, haiku: {...} }`
- `calcCost(input, output, cacheWrite, cacheRead, model)` — model param required, no flat fallback
- Every API route that computes cost (`/api/tokens`, `/api/tokens/timeline`, `/api/stats`, `/api/sessions`) uses per-row model from the DB, never a flat rate
- Tokens page, dashboard strip, session table, and session detail all show corrected numbers

**Files to touch:** `lib/utils.ts`, `app/api/tokens/route.ts`, `app/api/tokens/timeline/route.ts`, `app/api/stats/route.ts`, `app/api/sessions/route.ts`

### 0.2 Fix the logger race condition
**What's broken:** `time.sleep(0.3)` in `log-to-db.py` before reading transcript files is a race condition disguised as a delay. Sometimes Claude hasn't finished writing the JSONL before the logger reads it.

**What to build:**
- Replace `sleep(0.3)` with a retry loop that polls file size stability (if `os.path.getsize()` is unchanged for 2 checks 100ms apart, the file is done writing)

**Files to touch:** `log-to-db.py`

---

## Phase 1 — One-Command Install ✅ COMPLETE
> **Goal:** A new user gets from zero to a populated dashboard in under 60 seconds.

Currently the install is a 10-step hazing ritual including MySQL setup, plaintext password in a copied Python file, and `chmod 700`. This is the #1 reason this never gets past ~50 power users. No product survives a five-hour wall between curiosity and value.

### 1.1 Switch solo install to SQLite
- Add SQLite as the default storage backend (keep MySQL as opt-in for multi-user setups)
- All hot queries (`stats`, `tokens`, `events/timeline`) work fine without MySQL features
- One connection string in `.env.local` switches the backend

### 1.2 Ship `npx claude-dashboard init` (or a shell bootstrapper)
The bootstrapper does everything automatically:
- Writes `~/.claude/log-to-db.py` (no manual copy)
- Registers all 7 hooks in `~/.claude/settings.json` automatically
- Runs DB migrations against `~/.claude/dashboard.db` (SQLite default)
- Stores DB credentials in OS keychain — no plaintext password in any file
- Prints the dashboard URL and opens it

**Success metric:** new user runs one command, sees their first dashboard populated within their next Claude Code session.

---

## Phase 2 — The Moat: Conversation View as Debugger ✅ COMPLETE
> **Goal:** Surface what's already captured in `cc_transcript_records` that nobody else's tool shows. This is the only genuinely differentiated feature.

The data is already in the database. This phase is pure UI — exposing existing signal, not building new ingestion.

### 2.1 Permission decisions — make them visible
The `mergeTranscriptIntoMessages()` function already detects `rejected`, `mode_changed`, `instructions_given` outcomes. Render them as distinct inline cards:
- 🔴 **Rejected** — "You denied `Bash(rm -rf)` at 3:42pm"
- 🟡 **Mode changed** — "Permission mode: ask → bypassPermissions at 3:43pm"
- 🔵 **Instructions given** — "You added: 'always use the migration helper'"

### 2.2 Compact boundaries — show them inline
`cc_transcript_records.record_type = 'compact_boundary'` is captured but not rendered.
Show as a horizontal divider:
> `── conversation compacted at 3:42pm (saved 24k tokens) ──`

This is crucial debugging signal — users need to know when Claude's context was trimmed.

### 2.3 Thinking blocks — collapse by default
Long thinking blocks bury the actual response. Default to collapsed:
> `💭 Thought for 4.2s about authentication flow` ← click to expand

Currently shown inline, destroying conversational scan. Reference: ChatGPT o1 thinking display.

### 2.4 Per-turn cost
Show `$0.03` right-aligned and muted next to each assistant turn. The data is already per-message in the transcript. Reference: Stripe showing per-API-call cost.

### 2.5 API errors — separate lane
`cc_transcript_records.record_type = 'api_error'` is captured but not surfaced. Add a distinct "API errors" section on `/errors`, visually separate from tool errors. Different problem, different remediation.

### 2.6 Copy-patch button on diffs
Add a "copy patch" button on hover (top-right of each diff card). Highest single-feature ROI in any code-review UI. The diff renderer is already better than GitHub for short hunks — surface it.

### 2.7 Session HTML export (the viral mechanic)
Generate a single self-contained read-only HTML file for any session. Share it in Slack, email, GitHub comments. No auth required to view it.

This is what turns one user into a team. Nothing else in this roadmap has higher viral coefficient.

### 2.8 Conversation view: `/chat` split
The current `/chat` page does two unrelated things:
1. **Read-only replay** of past sessions — this is the moat
2. **Live interactive `claude -p` subprocess** — this is redundant with the CLI

**Action:**
- Rename the read-only replay to `/conversations` — make it the default landing after `/`
- Move the live interactive surface to `/chat`, mark it "Experimental"
- No new features for the live chat surface — keep-the-lights-on maintenance only
- If nobody complains `/chat` is broken for a month: delete it, recover 40% of the codebase

---

## Phase 3 — Dashboard Narrative 🚧 ACTIVE
> **Goal:** The home page answers "what did I do, how much did it cost, what went wrong" in under 3 seconds.

Currently the dashboard reads as a generic SaaS analytics page from 2019. Every datum treated as equally important. Reference: Linear's home (one panel, three numbers, activity feed).

### 3.1 Replace 4-stat-card row with a narrative header
Replace:
```
[Total Sessions] [Total Events] [Active Projects] [Error Rate]
```
With a single sentence at the top:
> `Today: 12 sessions · $4.21 spent · 1 error`  [Time: 24h ▾]

Users get the answer before their eyes have to focus.

### 3.2 Three sparkline cards (not four flat numbers)
Replace the stat cards with three cards that each include a 24h sparkline:
- **Spend** — `$4.21 ▲ 18% from yesterday` + sparkline
- **Cache savings** — `78% efficiency · saved $14` + sparkline
- **Error rate** — `0.8% ▼ from 2.1%` + sparkline

Reference: Vercel's billing card — number + trend + sparkline in one card.

### 3.3 One hero chart (stacked activity)
Replace the 3-chart row (activity + tool usage + agent donut) with one stacked area chart:
- Three series: **tool calls** / **events** / **errors** — stacked, not separate panels
- Click a bar = drill to that session
- Reference: Stripe's API request graph

Remove: the Agent Donut from the home page (advanced feature, <5% of users care on home).

### 3.4 Cost story on `/tokens`
Add one big number at the top:
> `You saved $47.21 from cache hits this month`

With a sparkline and one sentence explaining why (cache_read at $0.30/M vs $3.00/M input). Reference: Mailchimp's "you saved $X" pattern.

This is the number users will open the dashboard to see every day.

---

## Phase 4 — Visual System
> **Goal:** Strip the chrome. Make every element earn its space. 30 minutes of changes, biggest feel improvement.

### 4.1 Sidebar — remove per-nav colors
Currently each nav item has its own decorative color. Active state stacks 4 visual cues simultaneously (gradient bg + left border + colored icon bg + bold text). These colors compete with the chart palette.

**Fix:**
- Icons: monochrome (muted-foreground)
- Active state: single 2px `--primary` left border + foreground text + `bg-primary/5` — nothing else
- Reference: Linear's sidebar is literally one color

### 4.2 Fix three color collisions in `lib/colors.ts`
- `PreToolUse` and `PostToolUse` both `#F59E0B` → either split to `#F59E0B` / `#D97706` or collapse to one "tool call" color
- `Notification` === `system` === `#64748B` → give Notifications amber (`#D97706`) — they carry permission prompts
- `TaskCreate` / `TaskUpdate` / `TaskOutput` all `#8B5CF6` → use luminance steps: `#A78BFA` / `#8B5CF6` / `#7C3AED`

### 4.3 Dark-mode card shadow
Currently `--card-shadow: none` in dark mode, making cards feel flat.
Replace with:
```css
--card-shadow: inset 0 1px 0 hsl(var(--foreground) / 0.04), 0 1px 2px rgba(0,0,0,0.4);
```
Reference: Linear's card elevation.

### 4.4 Session table column reorder
Current order is wrong. Users scan for cost, not session IDs.

**New order (always visible):** Project · Started · Duration · **Cost** · Status
**Desktop only:** Tools used · Events · Model (hide if all sessions use same model)
**Remove from table:** Session ID (move to URL only), entrypoint, git branch

### 4.5 Activity Timeline chart cleanup
- Remove vertical X-axis gridlines (chartjunk per Tufte — keep only horizontal at quartile values)
- Token Timeline: replace area chart with a stacked daily bar (cache_read green, cache_write yellow, input gray, output blue) + secondary cost line on right Y-axis
- Heatmap: switch to 5-stop sequential single-hue ramp (currently three identical blues)

### 4.6 Errors page — group by message
Replace chronological list with grouped-by-message-hash view:
> `Connection timeout (×7 in 3 sessions, last: 2h ago)`

Reference: Sentry's issue grouping.

---

## Phase 5 — Retention & Growth
> **Goal:** Give users a reason to come back daily and show it to colleagues.

Only start this after the conversation debugger (Phase 2) is shipped and working.

### 5.1 Cost budget alerts
`POST /api/settings/budget` — daily spend threshold. When exceeded: a banner on the home page + (optional) email/webhook notification.

### 5.2 Weekly digest email
One email, every Monday:
- Total spend this week
- Top 3 tools, top 3 projects
- Cache efficiency trend
- One optimization recommendation (hand-coded rules first — "you're not using prompt caching on Agent calls")

### 5.3 Recommendations engine v1 (3 hand-coded rules)
Based on the data already captured:
1. "You spent $X on Opus calls that only used Bash/Read — Haiku would have cost $Y less"
2. "Your Agent tool calls average 180K tokens. Enable prompt caching on the orchestrator to save ~$Z/mo"
3. "Your typical session has 3 retries on the same Edit — here are the 5 prompts where this happens most"

These are the rules that justify a paid tier later.

### 5.4 Benchmark opt-in (future)
Anonymous aggregation of metrics across installs: "median tokens per session for a TypeScript refactor," "p90 Bash tool duration." This is the Datadog APM network effect — the moat that compounds with install base. Don't build until 500+ active installs.

---

## What We Are NOT Building

Stated explicitly. Push back if the wind shifts:

| Thing | Reason deferred |
|---|---|
| Multi-tenant / team features | Not until 1,000+ solo installs |
| VS Code extension | Dilutes focus; data product must be unambiguous first |
| More charts on the home page | Information saturation already high; every new chart must displace one |
| Live chat improvements | CLI is strictly better; invest in read-only replay instead |
| Mobile-first redesign | Desktop dashboard not fully optimized yet; mobile is downstream |
| Accessibility audit | Right bones in the HSL palette; full audit after visual system settles |

---

## The Two-Path Decision (revisit after Phase 2)

The CEO flagged this. Don't decide now — decide after Phase 2 ships and there's install data.

**Path A: Beloved open-source tool**
Stay free, Homebrew tap, SQLite, build community. Portfolio piece. ~5% acqui-hire probability.

**Path B: Cost-optimizer SaaS for AI coding**
Pivot value prop from "see your activity" to "spend 30% less on Claude API." Hosted, team accounts, $19/mo. ~5–10% probability of $1M ARR in 18 months — the asymmetric bet.

The data the logger already captures is good enough to ship a cost-optimization product today. What's missing is positioning and a Stripe button, not engineering.

**Required for both paths:** Phase 0 + Phase 1 + Phase 2. Start there.
