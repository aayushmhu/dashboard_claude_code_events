# UI/UX Designer Review — Claude Code Dashboard

**Reviewer**: UI/UX Designer (20 years; Bloomberg Terminal, Datadog, Grafana, Stripe, Vercel, Linear)
**Date**: 2026-05-12
**Scope**: Visual system, dashboard composition, conversation view, table design, new widgets, micro-interactions.
**PM review status**: `pm-review.md` was blocked by sandbox (see `.claude/reviews/pm-raw.log`). PM-identified gaps inferred from data model (cc_transcript_records, Session type, capture fields). Marked `[inferred]` below.
**Note on path**: This file lives at repo-root `reviews/` instead of `.claude/reviews/` because the latter is sandbox-guarded for writes (same block that prevented `pm-review.md`).

---

## 0. Executive opinion (read this if nothing else)

This dashboard is *competently built* but designed like a SaaS analytics page from 2019. It treats every datum as equally important, every chart as equally interesting, and every page as equally weighted. Tufte would call most of the chrome "non-data ink." Linear and Vercel would strip 40% of the visual elements without losing a single insight.

The single biggest opportunity is **the conversation view** (`/conversations`). Nothing else in the developer-tools space surfaces *what Claude actually did to the codebase* with this much per-tool fidelity. The diff renderer in `components/tool-call-card.tsx` is genuinely better than GitHub for small diffs. That's the moat. The dashboard pages around it are commodity. **Lead with the conversation view, support it with the dashboard, not the other way around.**

The second biggest opportunity is **cost storytelling**. You capture cache_read/cache_write/input/output separately — almost no one shows users the cache savings *they got for free*. That's a daily-active-use hook.

Top 5 priorities, ranked, before reading the rest:

1. **Rebuild `/` (home) around three questions, not 9 widgets** — "what did I do today, how much did it cost, what went wrong"
2. **Add a permission/decision timeline to the conversation view** — you capture rejected, mode_changed, instructions_given outcomes and don't show them
3. **Kill the per-nav decorative colors in the sidebar** — they fight the data colors in the charts
4. **Collapse the 4-color stat-card top borders into one neutral hairline** — they create a competing reading rhythm
5. **Make the conversation page a router-default** — it's the product

---

## 1. Foundations audit (`app/globals.css`, `lib/colors.ts`, `lib/types.ts`)

### 1.1 Theme tokens — keep mostly, fix two

**Keep**:
- HSL CSS-variable system. Correct primitive.
- `--radius: 0.75rem`. Right for cards; matches Vercel/Linear scale.
- Tabular-numerals utility (`.font-mono-num`). Essential for tables — *use it more aggressively* (every numeric cell, every stat card value).

**Fix**:
- **Dark-mode shadows nuked to `none`** (line 31). That's why dark cards feel flat next to charts that have inherent depth. Bring back a *one-pixel inset highlight* instead of removing all elevation:
  ```css
  --card-shadow: inset 0 1px 0 hsl(var(--foreground) / 0.04), 0 1px 2px rgba(0,0,0,0.4);
  ```
  Linear uses exactly this. The inset hairline is what separates "designed" from "made with Tailwind defaults."
- **`.glass` utility is unused.** Either ship it on the sidebar/header (with a `backdrop-blur` over a content-rich page like `/conversations`), or delete it. Dead code in CSS is worse than dead code in TS — it suggests the design system isn't disciplined.

### 1.2 Color system — three collisions to resolve

- `EVENT_TYPE_COLORS.PreToolUse` and `PostToolUse` are both **#F59E0B**. Visually you can't tell a "tool started" event from "tool finished" in any timeline. Either give them split shades (`#F59E0B` for pre, `#D97706` for post) or — better — **collapse them into one "tool call" color** and stop showing the pre/post distinction on the timeline.
- `EVENT_TYPE_COLORS.Notification` === `ROLE_COLORS.system` === **#64748B**. Notifications then read as "system messages" in a heatmap, which is wrong. Notifications carry permission prompts — give them **amber** (`#D97706`) to signal "user attention needed."
- `TOOL_COLORS.TaskCreate`, `TaskUpdate`, `TaskOutput` all share **#8B5CF6**. A Task lifecycle in any timeline collapses into one mono-purple blob. Use a single base hue with luminance steps: `#A78BFA` (create), `#8B5CF6` (update), `#7C3AED` (output).

### 1.3 Typography — one missing thing

You have `font-feature-settings: "cv02","cv03","cv04","cv11"` on body. Add `"ss01"` for tighter colon spacing and **`"tnum"` globally on tables** — currently it lives on `.font-mono-num` which is applied piecemeal. Datadog and Stripe both ship `tnum` site-wide; numeric columns jitter without it.

### 1.4 Spacing — pick a base, stop drifting

You use both `space-y-4`, `space-y-6`, `gap-3`, `gap-4`, `gap-6` within the same page (`app/page.tsx`). Pick **4 / 8 / 16 / 24 / 32** (Linear's scale) and enforce it. Right now cards have `p-6`, headers have `p-6 pb-2`, and the result is a 16px gap between header and content that doesn't match any other gap on the page.

---

## 2. Charts audit (`components/charts/*`)

### 2.1 Activity Timeline — redesign

Currently an AreaChart with the default Recharts axes and gridlines. Three changes:
- **Remove the X-axis gridlines.** Vertical grid on a time series is chartjunk (Tufte). Keep only horizontal at the *quartile values* of the dataset, not at fixed intervals.
- **Stack three series, not one** — events / tool-calls / errors. Right now it shows total events, which is "how busy" but not "what kind of busy." Stripe's API request graph does this and it's the difference between a graph you glance at and one you read.
- **Show the cursor as a vertical hairline at 1px** with the tooltip pinned to the right side of the viewport (not floating). Floating tooltips obscure the trend you're trying to see.

### 2.2 Token Timeline — keep area, change story

The data is right but the chart is wrong. Tokens-over-time is monotonic (it goes up), so users see a curve and think "growth!" — but the story you want to tell is *cost per session* or *cache hit rate*. Replace with:
- **Bar chart, daily**: stacked cache_read (green) + cache_write (yellow) + input (gray) + output (blue). Cache-read at the bottom emphasizes the discount.
- Add a secondary line: **$ spent that day** on a right Y-axis.
- Datadog's "API cost explorer" is this exact composition.

### 2.3 Tool Usage Bar — fine, two tweaks

- Sort descending by count (already?), but **cut the tail at top-10 with a "+N more" segment** like Linear's filter pills.
- Color each bar by the tool's category (file / search / process / agent), not a rainbow.

### 2.4 Model Breakdown / Agent Donut / Cost Breakdown — collapse to one component

Three donut charts on three different pages, all showing "share of total." They should be the same `<ShareDonut>` component with a `dimension` prop. Right now each one re-implements the legend slightly differently. Vercel ships one `<UsageRing>` everywhere.

Also: **donuts under 6 segments are fine; over 6, switch to a stacked horizontal bar.** A 9-slice donut is unreadable.

### 2.5 Heatmap (in `app/page.tsx`) — keep, lower temperature

The activity heatmap is the best chart on the dashboard. But the color ramp goes blue → blue → blue, which means a low-activity day and a high-activity day look identical at a glance. Use a **sequential single-hue ramp with 5 stops** (`#1e293b → #1e40af → #3b82f6 → #60a5fa → #93c5fd` in dark mode). GitHub's contribution graph is the reference; you're 80% of the way there.

---

## 3. `app/page.tsx` — Dashboard redesign

### What to keep
- Stat-card pattern (the *idea* — a tile with one big number, label, sublabel). Just not 4 of them in a row.
- Recent sessions table at the bottom.
- The fact that the page exists at all. Many devs will land here.

### What to remove
- **The top accent gradient line on every stat card** (`components/stat-card.tsx:44`). Four cards in a row create four parallel colored lines — they look like nav tabs. Pick one. Or none.
- **The "workspace insight strip"** if it's just "you used X tools in Y projects." Replace with a *single sentence narrative* (see below).
- **The agent donut at the bottom** — agents are an advanced feature; this is dashboard real-estate spent on <5% of users. Move to `/projects` or a dedicated `/agents` view.

### What to redesign

Layout proposal (ASCII):

```
┌─────────────────────────────────────────────────────────────┐
│  "Today: 12 sessions · $4.21 spent · 1 error"  [Time: 24h▾] │  ← narrative header
├─────────────────────────────────────────────────────────────┤
│  ┌─Spend─────────────┐ ┌─Cache savings──┐ ┌─Error rate────┐ │
│  │ $4.21  ▲ 18%      │ │ 78%  saved $14 │ │ 0.8%  ▼ from  │ │
│  │ ▁▂▄▆█▇▅▃ (24h)    │ │ ▆▇█▇▇▇▆▅       │ │ 2.1% yesterday│ │
│  └───────────────────┘ └────────────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  Activity stream (stacked: tool / event / error)    [24h▾]  │  ← the chart that matters
│  ▁▂▄▆█▇▅▃▂▁▂▃▅▆█▇▆▄▃▂▁▂▃▄                                  │
├─────────────────────────────────────────────────────────────┤
│  Recent sessions (table, max 8 rows, "View all →")          │
└─────────────────────────────────────────────────────────────┘
```

Three principles:
1. **Top line is a sentence**, not metrics. "Today: 12 sessions · $4.21 spent · 1 error" answers the question every user has in <1 second. Stripe's home does this. Linear does this. Vercel does this.
2. **Three stat cards, not four** — and each has a sparkline showing 24h trend (not just a number). The sparkline is the difference between "$4.21 spent" and "$4.21 spent, trending up sharply at 3pm." Vercel's billing card is the reference.
3. **One hero chart**, not three. Stacked activity stream. Click a bar = drill to that session.

### Reference
- Linear's home is *one panel with three numbers and an activity feed*. The dashboard tries to be Datadog and ends up being neither.

---

## 4. `app/chat/client.tsx` — Conversation view review

This is the product. Treat it accordingly. It's currently 2596 lines doing IDE-level work and it's *mostly excellent*. Recommendations:

### 4.1 Session header — collapse to 3 chips + overflow

The header at lines 2121–2196 crams 11 metadata items: model, agents, tools, duration, started, ended, branch, entrypoint, cost, cache rate, error count. Too much. Treat it like the Datadog APM trace header:
- **Always-visible**: cost · duration · model
- **Behind "Details" disclosure**: everything else
- **Branch / entrypoint** belong as a single chip: `feat/auth (cli)`

### 4.2 Tool-call cards — the diff view is great, three tweaks

- **The diff at 61–116 with the LCS algorithm at 119–146** is genuinely better than GitHub for short hunks. Keep all of it. Don't touch.
- **Add a "copy patch" button** on hover top-right of the diff. The most-requested feature in any code-review UI.
- **For Read/Glob/Grep**: collapse by default to one line ("Read `app/page.tsx` (438 lines)"). Currently all results are expanded; a long session becomes scroll-hell. Click to expand. Linear's notification stream does this.

### 4.3 Permission decisions — surface them, currently invisible [partially inferred]

The `mergeTranscriptIntoMessages` function at 279–296 already detects `rejected`, `mode_changed`, `instructions_given`. **Render these as distinct cards** with a left border color:
- **Red** for `rejected` — "You denied `Bash(rm -rf)` at 3:42pm"
- **Amber** for `mode_changed` — "Permission mode: ask → bypassPermissions at 3:43pm"
- **Blue** for `instructions_given` — "You added: 'use the migration helper'"

No other Claude Code tool shows this. It's an immediate "wow" moment for users who don't realize this data exists. Reference: Sentry's "user feedback" thread in an issue.

### 4.4 Thinking blocks — make them collapsible by default

Long thinking blocks bury the actual response. Default-collapsed with a one-line summary:
- `💭 Thought for 4.2s about authentication flow` ← click to expand

Like ChatGPT's `o1` thinking display. The current implementation shows them inline, which destroys the conversational scan.

### 4.5 Images/documents — show inline thumbnails, not links

If `cc_transcript_records.record_type = 'image'` exists, render the image inline at 240px max-width with a click-to-expand. Currently (per type definitions) the count is surfaced but the content isn't.

### 4.6 Scroll-to-bottom — keep, add "new messages" indicator

Auto-scroll on new events is good. Add a floating "↓ 3 new" pill at bottom-right when the user has scrolled up. Slack's pattern.

### 4.7 Sidebar — add filter + search

The session list is just chronological. Add:
- **Filter chips**: All / Active / With errors / Today
- **Search by content** (not just session ID)

Linear and Vercel both do this on their respective lists.

---

## 5. Other pages — what to keep, remove, redesign

### `/projects`
- **Keep**: card grid, project name extraction.
- **Remove**: nothing.
- **Redesign**: add a *spend* column to each card. Currently you show session count and event count; cost is the metric users care about. Sort default = "most recent activity," not alphabetical.

### `/sessions`
- **Keep**: the paginated table, the filters.
- **Remove**: any column not in the priority list below (see §6).
- **Redesign**: row hover should reveal a 3-event preview (last user prompt, last tool, last response). Linear's issue list does this on row hover and it's the single biggest UX-per-pixel win you can ship.

### `/tools`
- **Keep**: the per-tool drill-down concept.
- **Remove**: the redundant total-count column when share-% is also there.
- **Redesign**: lead with a **dot plot of avg vs max duration**, one dot per tool. Bash being far-right tells the story instantly. Datadog APM's "slowest endpoints" view.

### `/tokens`
- **Keep**: cost-by-project bar.
- **Remove**: the standalone "Excl. Cache cost" column from the dashboard strip (it's noise on the home page; keep it on `/tokens`).
- **Redesign**: this page is the right place for the **cache savings story**. Add a single big number at the top: "You saved $47.21 from cache hits this month." With a sparkline. Mailchimp's "you saved $X" pattern.

### `/errors`
- **Keep**: empty state with icon. Crucial.
- **Remove**: nothing — page is sparse on purpose.
- **Redesign**: group by error message (fuzzy-match), not chronological. "Connection timeout (×7 in 3 sessions)" is more useful than 7 individual rows. Sentry's grouping logic.

---

## 6. Session table — column priorities (`components/session-table.tsx`)

**Must-have** (always visible, desktop and mobile):
1. **Project** (badge, color-coded by hash of project_dir)
2. **Started** (relative time: "3m ago")
3. **Duration** (formatMs)
4. **Cost** (formatCost) — currently buried; this is the column users scan for
5. **Status** (running / done / errored, single icon)

**Desktop-only**:
6. Tools used (max 3 chips + "+N")
7. Events count
8. Model (only if mixed in the dataset; hide if all sessions use one model)

**Hide entirely / move to expand row**:
- Session ID (hash; useless at a glance — move to URL)
- Entrypoint, git branch, agent types (overflow menu)

**Row density**: 44px (current looks like 56px). Linear ships 36px and it's tight but readable; 44px is the sweet spot for mixed text/numeric.

---

## 7. PM-identified gaps — visualization recommendations [inferred from schema]

The PM review didn't land, so the following gaps are inferred from `migrations/007_create_transcript_records.sql`, `lib/types.ts`, and the Claude Code event model. Each item: *the gap*, then *how to visualize*.

### 7.1 Thinking time / reasoning depth
Data captured in `cc_transcript_records` (record_type=`thinking`). Not surfaced.
**Viz**: per-session "Reasoning" strip in the conversation header — `▁▂▄▆▂▁` showing thinking duration per turn. Click = jump to that turn.

### 7.2 Permission denials / rejections
Captured in transcript_records. Not surfaced anywhere.
**Viz**: dashboard widget "Permission denials this week (3)" with the most recent ones listed. Like Sentry's "new issues."

### 7.3 Cache efficiency per session
Computed in `TokenTotals.cache_efficiency`, not shown per-session.
**Viz**: column in the sessions table; a horizontal bar 0–100% filled green. Vercel's "build cache hit rate" pattern.

### 7.4 API errors
Captured as `record_type='api_error'`. Not surfaced.
**Viz**: a banner on `/errors` segregating "API errors" from "tool errors." Different remediation paths.

### 7.5 Permission mode changes
Captured as `permission_mode` column per record. Not shown.
**Viz**: a thin strip above the conversation thread showing mode-over-time as a colored bar. `ask | acceptEdits | bypassPermissions` color-coded. Like Git's branch protection badge.

### 7.6 Compact boundaries
Captured as `record_type='compact_boundary'`. Not surfaced.
**Viz**: in the conversation view, render as a horizontal divider with text: "── conversation compacted at 3:42pm (saved 24k tokens) ──". Crucial debugging signal.

### 7.7 Subagent activity
`agent_types` column on sessions. Surfaced as a chip but not analyzed.
**Viz**: agent-call tree on the conversation page — a left rail showing main agent + subagent invocations as an indented tree. Visualizes delegation. Datadog APM service map's tree view.

### 7.8 Model mix per session
`models_used` array per session. Not analyzed.
**Viz**: dashboard widget "Model mix this week" — small donut. Users running multiple models (opus + haiku via subagents) deserve to see the breakdown.

### 7.9 Tool-call duration outliers
`duration_ms` per PostToolUse. Captured, not surfaced.
**Viz**: on `/tools`, add a "Slowest calls this week" list. Click = jump to that session at that tool call. Datadog APM trace flame graph (link, don't reimplement).

### 7.10 Cost per turn (not just per session)
Computable from token data + transcript turn boundaries.
**Viz**: in the conversation thread, show "$0.03" next to each assistant turn (right-aligned, muted). Stripe shows per-API-call cost; this is the same pattern.

---

## 8. Micro-interactions (everywhere)

- **Skeleton loaders** — present but use `animate-pulse` on full-card blocks. Change to *shimmer* (the `@keyframes shimmer` you already defined at globals.css:103 but never use). Subtler, less twitchy.
- **Chart tooltips** — currently fade in. Add a 50ms delay so they don't appear on every accidental hover. Linear does this and it changes the entire feel.
- **Card hover** — the `card-hover-glow` translateY in light mode (line 117) is fine but the dark-mode blur halo (lines 119–124) is too aggressive. Reduce blur radius to 16px and opacity to 0.04.
- **Number changes** — animate stat card values with a 200ms `framer-motion` `animate` on value change. Subtle but signals "this is live data."

---

## 9. Sidebar (`components/sidebar.tsx`) — strip the costume

Lines 24–86: each nav item has its own decorative color. Lines 191–195: active state stacks gradient bg + left border + colored icon bg + bold text — *four cues at once*. Pick one.

Recommendation:
- **Remove all per-nav colors.** Icons monochrome (muted-foreground), text muted.
- **Active state**: single 2px left border in `--primary`, foreground text, slight bg `bg-primary/5`. That's it.
- **Sidebar is chrome**, not content. Colors here compete with the chart palette. Linear's sidebar is literally one color.

---

## 10. Top 5 priorities (engineering order)

1. **Conversation view: permission decisions + thinking blocks + compact boundaries** — biggest moat, 1–2 days of work, all data already captured.
2. **Dashboard rebuild around narrative header + 3 cards + 1 hero chart** — kill chartjunk, ship the "what happened today" line.
3. **Sidebar simplification** — 30 minutes, makes the whole product feel calmer.
4. **Cost story on `/tokens`** — "you saved $X with cache" big number. Free win, the data is right there.
5. **Session table column reorder + cost column** — half a day, highest scan-utility-per-pixel.

---

## What I did NOT review

- `app/api/*` route handlers — out of scope for design review (PM's territory).
- Mobile breakpoints in detail — the desktop dashboard isn't optimized yet; mobile is downstream.
- Light-mode polish — dark mode is the default and 90% of usage; light needs its own pass later.
- Accessibility audit (focus rings, contrast, keyboard nav) — flagged for a follow-up. The HSL palette has the right bones but tab-order and `aria-*` weren't audited.
- `react-markdown` rendering quality — would need to see real outputs in situ.

---

## Closing

You have a genuinely differentiated product hidden inside a generic-looking dashboard. The transcript records table is a treasure chest no one else is opening. Open it. Lead with the conversation view, strip the chrome elsewhere, and tell the cost story in one sentence at the top of the home page.

Make every element earn its space. Right now half of them are renting.
