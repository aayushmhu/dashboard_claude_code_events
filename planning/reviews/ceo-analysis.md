# CEO Strategic Assessment — Claude Code Activity Dashboard

**Date:** 2026-05-12
**Reviewer:** CEO (15+ yrs in dev tools)
**Verdict in one line:** A genuinely impressive solo-built observability tool for AI coding that has no moat, no distribution story, and no business model — but with one or two sharp pivots it could become the Datadog-for-AI-coding category-definer.

---

## 1. What this product actually is

Stripped of the marketing, this is **three products glued together**:

1. **A hook logger** (`log-to-db.py`, 583 LOC) — captures all 7 Claude Code hook events plus parses the JSONL transcript files for thinking blocks, images, rejections, permission changes, token usage.
2. **A read-only analytics dashboard** (7 Next.js pages: Dashboard, Projects, Sessions, Tools, Tokens, Errors, Conversations) — stat cards, charts, timelines, heatmap, drill-downs.
3. **An interactive coding interface** (`/chat`, 2,596 LOC client + 9 backing API routes) — spawns `claude -p` as a subprocess, with a VS Code-style file explorer, Monaco editor, file preview, and 1,138-line tool-call card renderer.

Everything is **self-hosted**: local MySQL, local dashboard, local logger. There is no SaaS, no auth, no multi-tenant. One user, one machine.

---

## 2. What it does well

### 2a. Data capture is genuinely complete

The logger is the strongest piece of engineering in the codebase. It doesn't just consume hook payloads — it cracks open the transcript JSONL files on Stop/SubagentStop and pulls out:

- Per-message token usage (input / output / cache_creation / cache_read)
- Thinking blocks
- Images and documents (stored as base64 in `cc_transcript_records.content_image`)
- Tool rejections (when the user denied a permission)
- Permission-mode changes
- API errors, compact boundaries, entrypoint (cli vs vscode vs sdk), git branch, stop reason

The `cc_transcript_records` schema (migration 007) and the resumable-import logic via `MAX(record_index)` is *good* engineering — most observability tools either lose this data or store it as opaque JSON blobs. This product makes it queryable.

**This is the asset.** Everything else is replaceable; the data model and what's in it is not.

### 2b. Cost intelligence is the killer wedge

`/tokens` is the page a developer comes back to. The token-cost surface is genuinely thoughtful:

- Per-token-type breakdown with rates (input \$3/M, output \$15/M, cache write \$3.75/M, cache read \$0.30/M)
- **Cache savings** ("\$X saved because cache_read at \$0.30/M instead of input at \$3/M") — this is the right way to frame caching, not "cache hit rate"
- 30-day cost forecast extrapolated from daily average
- "Excl. Cache" column on per-project table — separates real spend from cache churn
- Cost by project, cost by model

Most third-party dashboards I've seen show token counts. This shows **dollars**, which is the only number a CFO or a developer-on-a-budget actually cares about.

### 2c. Visual polish is above expectation for a solo project

- Linear/Vercel aesthetic is consistent across pages
- Sidebar collapse, mobile hamburger, dark/light theme via `next-themes`
- Skeleton loaders, empty states with icons + copy
- Activity heatmap (GitHub-style 52-week grid) — instant pattern recognition
- The conversation/chat replay merges Pre/PostToolUse into single cards with diffs

If I saw this in a YC pitch, I would not assume it was solo-built.

### 2d. The interactive `/chat` is an ambitious bet

Spawning `claude -p` from a Next.js API route with `stdio: ['pipe','pipe','pipe']` and streaming stream-json back to the browser is non-trivial. It supports images, slash commands, permission modes, model selection, and resume via `--resume <session_id>`. The Monaco editor + file tree + tool-call card stack is a real product surface.

That said — see §3c for why this is also the most strategically confused part.

---

## 3. What it does poorly

### 3a. Onboarding is a 7-step hazing ritual

To get any value out of this product a new user must:

1. Install MySQL + run `mysql_secure_installation`
2. Create a database + user + grant privileges
3. Clone the repo + run migrations
4. `pip install mysql-connector-python`
5. Copy `log-to-db.py` to `~/.claude/` and **hardcode their DB password** in plaintext
6. `chmod 700` (not 600 — the README explicitly calls this out because people get it wrong)
7. Hand-author `~/.claude/settings.json` with 7 hook entries
8. Fully restart Claude Code
9. `npm install` + configure `.env.local`
10. `npm run dev`

Compare to Vercel (`npx vercel`), Sentry (one DSN), Posthog (one snippet). **This is a five-hour wall** between curiosity and value, and it's why this will never get past power-user-on-a-homelab without a rewrite.

The fact that **the password is embedded in a Python script the user copies into their home directory** is also a security smell. `chmod 700` is a workaround, not a fix.

### 3b. The cost math is a footgun

`calcCost()` in `lib/utils.ts` hardcodes **Sonnet pricing**. But `cc_events.model` captures Opus, Sonnet, Haiku, all of them — and the logger correctly stores it. So:

- A user running heavy Opus sessions (input \$15/M, output \$75/M) sees costs **5x understated** on the dashboard.
- A user running Haiku sees costs ~2.5x **overstated**.

For a product whose primary value proposition is cost visibility, wrong cost numbers are worse than no cost numbers. The schema has `model` on every row. There is no reason this is not per-model pricing.

### 3c. The product has identity confusion: dashboard or IDE?

Two pages overlap awkwardly:

- `/conversations` — read-only chat replay of past sessions, auto-refreshes every 15s
- `/chat` — live, interactive Claude Code session in the browser with a file tree and editor

`/chat` is 2,596 lines of client code. `tool-call-card.tsx` is 1,138 lines. Both are monolithic React components that will be impossible to maintain by anyone but the original author.

More importantly: **why would a Claude Code user open a browser to use Claude Code?** They already have the CLI and VS Code extension. The browser doesn't offer keyboard ergonomics, doesn't have inline diff, doesn't have terminal sharing. The only reason to use this would be (a) the cost dashboard sitting next to it, or (b) showing a non-developer ("look what AI built"). Neither is a strong daily-use case.

If `/chat` were killed tomorrow, the dashboard would lose ~40% of its code and ~5% of its value. It exists because it's cool, not because it's needed.

### 3d. Single-machine, single-user, no sharing

There is no auth, no team view, no shared link, no export, no "show my CTO our token spend this week." The data is locked to one machine's MySQL. Even if you build the data set every day, you can't *show* it to anyone without screen-sharing.

For a tool whose value compounds with team adoption (cost dashboards always do), this is the single biggest strategic gap.

### 3e. Minor but real

- Polling at 15s instead of WebSocket/SSE push — `/conversations` will scale poorly past a few thousand events
- No alerts ("you are over \$100/day"), no budgets, no quota enforcement
- No backup/export — if MySQL dies, history is gone
- `time.sleep(0.3)` in the logger before reading transcripts is a race condition disguised as a delay
- Migrations 006 + 007 land transcript columns and a separate transcript table at the same time — schema is not crisp; `cc_events` and `cc_transcript_records` have overlapping responsibility

---

## 4. Who the real user is

The marketing positioning ("track every Claude Code session") implies a broad audience. The actual product fits a much narrower one.

### The real user is: the author and ~500-2,000 developers like him

- Heavy daily Claude Code user (Opus 4.x tier, probably \$200-1,000/mo in API spend)
- Comfortable with MySQL, Python, Next.js — runs Postgres for fun
- Self-hosts things on principle (Plex, Home Assistant, Pi-hole)
- Wants visibility into their *own* usage, not their team's
- Does not trust Anthropic's billing dashboard to be granular enough
- Is *not* going to pay for SaaS, but might pay a one-time \$49 license for a desktop app

### The user it is NOT for (despite seeming to be)

- **Enterprises** — no auth, no SSO, no audit log, no role-based access. A CISO would not let this anywhere near production.
- **Teams** — single MySQL, no multi-tenant, no permissions.
- **Casual Claude Code users** — the setup tax kills them.
- **Anthropic / Claude Code official** — Anthropic will build their own observability if they want it; they will not adopt a third-party MySQL-dependent tool with a chmod 700 step.

### The implication

If the author wants this to be a *product* and not a *project*, he has to pick: **stay a beloved tool for power users** (with a Homebrew tap and one-command install), or **become a business** (which requires a SaaS pivot, auth, teams, and a hosted offering). Trying to be both is what the codebase currently is, and it is why it does not quite work as either.

---

## 5. What the moat could be

### Today: there is no moat

- The Claude Code hook system is a public API. Anyone can write a logger.
- The UI is polished but not novel. A team of two could rebuild it in a month.
- The data is stored on the user's machine. Switching cost = `mysqldump`.
- There is no network effect, no proprietary data, no community.

### Plausible moats, ranked by defensibility

**1. Become the canonical "what was Claude actually doing?" forensic tool (HIGH defensibility, medium effort)**

The transcript-parsing logic is the real asset. Nobody else surfaces thinking blocks, rejections, permission-mode changes, and tool I/O in one place. Lean into this:

- Make the conversation replay into a **debugger** for agent runs — search across thinking blocks ("show me every time Claude decided to use Bash for a git operation"), diff between sessions, replay with annotations, share a session URL like a stack trace.
- Add `cc compare session-A session-B` — what did Claude do differently between two attempts on the same task?
- This becomes the tool people use *after* something went wrong. That is a high-value, repeated need.

**2. Cost optimization advisor (HIGH defensibility once you have data, low effort)**

The schema has model + tokens + tool_name + tool_output_size per event. With that, you can answer:

- "You spent \$47 last week on Opus calls that only used Bash and Read. You could have used Haiku and saved \$39."
- "Your `Agent` tool calls average 180K tokens. You are paying for context that is not changing — enable prompt caching for the orchestrator and save ~\$X/mo."
- "Your typical session has 3 retries on the same Edit. Claude is fighting itself. Here are the 5 prompts where this happens most."

This is the kind of *prescriptive* output that a \$20/mo subscription justifies. And once you have a year of usage data, the recommendations get better — which is the actual flywheel.

**3. Anonymous benchmarks across users (MEDIUM defensibility, high effort, big payoff)**

If 5,000 developers opt-in to share anonymized metrics, you get a unique data set: "median tokens per session for a TypeScript refactoring task," "p90 duration of Bash tool," "error rate on Edit by repo size." That benchmark becomes the moat — like Datadog's APM medians or like GitHub's "developers like you commit X times a week."

This requires the SaaS pivot.

**4. Be acquired by Anthropic (LOW probability, but worth considering)**

Anthropic does not currently ship an observability dashboard for Claude Code. They will, eventually. The acqui-hire price for a polished implementation already wired to all the hooks is non-zero — but the author needs distribution signal (1,000+ active installs, social proof) before they would buy. Right now it is a private repo.

### What is NOT a moat

- The interactive `/chat` page — Claude Code's own CLI is strictly better.
- The pretty UI — replicable in weeks.
- The fact that it is open source — the *absence* of a paid SaaS is not a moat; it is a missing business model.

---

## 6. If I were running this product, the next 90 days

Strict prioritization. Anything not listed is "drop or defer."

**Week 1-2: Fix the lies**
- Per-model cost calculation. Wrong numbers are existential for a cost tool.
- One-command install: `brew install claude-dashboard` → bundles SQLite (drop MySQL dependency for solo users), runs migrations, registers hooks, opens browser. The setup tax is the #1 reason this is not a product yet.

**Week 3-4: Pick a moat and double down**
- Build the "session diff / debug" view. It is the only feature that has no good substitute.
- Add session sharing — generate a read-only HTML export of one session that can be sent in Slack. This is the viral mechanic.

**Week 5-8: Make it useful daily, not just impressive**
- Cost budget + alert ("notify me when daily spend > \$X")
- Weekly email digest ("you spent \$X, top 3 tools, top 3 projects, 2 things to optimize")
- Recommendations engine v1 — three hand-coded rules ("you are not using prompt caching on your Agent calls" etc.)

**Week 9-12: Kill or commit on `/chat`**
- Either rip it out (recover 40% of the codebase as maintenance surface) or commit to one feature the CLI cannot do: visual session branching, side-by-side diff of two Claude attempts, image annotation. Half-finished is the worst option.

**Don't build:**
- Multi-tenant / team features (not until 1K solo users)
- More charts (information saturation is already high)
- VS Code extension (until the data product is unambiguous)

---

## 7. The honest bottom line

This is a 9/10 piece of engineering wrapped around a 4/10 product strategy.

The author built the hard things (hook capture, transcript parsing, cost math, polished UI, streaming chat subprocess) and skipped the easy things that determine whether it becomes a business (one-command install, per-model pricing, sharing, alerts, a paid tier).

**Two paths from here:**

1. **Beloved open-source tool.** Stay free, kill `/chat`, ship Homebrew + SQLite, build community, accept that this is a portfolio piece. Probability of \$0 revenue: 100%. Probability of acqui-hire: ~5%.

2. **Cost-optimizer SaaS for AI coding.** Pivot the value prop from "see your activity" to "spend 30% less on Claude API." Hosted offering, team accounts, per-model pricing fixed, benchmark data, \$19/mo. Probability of \$0: ~70%. Probability of \$1M ARR in 18 months: 5-10%, which is the asymmetric bet worth taking.

I would take path 2. The data the logger already captures is **good enough to ship a cost-optimization product today** — what is missing is positioning and a `Stripe Connect` button, not engineering.
