# CLAUDE.md

> **Detailed architecture reference for this dashboard.** Project rules, run commands, and the startup workflow live in [`AGENTS.md`](AGENTS.md) — read that first. This file is the deep reference for the codebase shape itself.

## Architecture

**Tech stack**: Next.js 15 App Router · Tailwind CSS · shadcn/ui · Recharts · better-sqlite3 · Lucide React · date-fns · react-markdown · next-themes · Monaco editor (chat) · react-syntax-highlighter

**Database** — SQLite at `~/.claude-dashboard/dashboard.db`. Five tables:

`cc_sessions`:
- `session_id` (PK), `started_at`, `last_seen_at`, `cwd`, `project_dir`, `model`

`cc_events`:
- `id` (PK), `session_id`, `timestamp`, `event_type`, `agent`, `role`, `content`
- `tool_name`, `tool_input` (JSON text), `tool_output` (JSON text)
- `is_error`, `error_message`, `raw_payload` (JSON text), `transcript_path`
- `model`, `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `total_tokens`
- `duration_ms`, `entrypoint`, `git_branch`

`cc_transcript_records`:
- Per-turn transcript data: thinking blocks, images, permission decisions, compact boundaries, API errors

`chat_sessions`:
- Live chat sessions for the `/chat` experimental interface

`settings`:
- Key/value store (`key TEXT PK, value TEXT`) for user preferences (e.g. budget config)

**Data access**: All DB queries in API route handlers (`app/api/...`). No direct DB access from client components. Shared SQLite connection in `lib/db.ts`.

**lib/db.ts** registers three MySQL-compatible SQLite UDFs so SQL in routes doesn't need changing:
- `SUBSTRING_INDEX(str, delim, count)` — extracts path segments
- `TIMESTAMPDIFF('SECOND', start, end)` — returns duration in seconds
- `JSON_LENGTH(json)` — returns array/object length

**Pages** (14 routes, 11 unique):

| Route | Purpose |
|---|---|
| `/` | Dashboard — stat cards, token summary strip, activity timeline, tool usage chart, recent sessions, agent donut |
| `/projects` | Card grid per `project_dir` |
| `/projects/detail` | Per-project drilldown — header stats, cost timeline, cost by model, sessions, top tools + agents used (side-by-side), errors |
| `/sessions` | Paginated table with project/date/error filters |
| `/conversations` | Read-only chat replay — session sidebar + scrollable event thread, load-older scroll, HTML export, Ask Claude button. Has both a Conversation tab (raw thread) and a Summary tab (panel). |
| `/conversations/[id]/summary` | Dedicated full-page session summary (header stats + Prompts list with response excerpts) |
| `/chat` | Live interactive Claude chat — file explorer, Monaco editor, streaming *(Experimental)* |
| `/tools` | Tool analytics — usage chart, per-tool table with avg/max duration |
| `/tokens` | Token usage — totals, cost estimation, timeline chart, model breakdown donut, cost-by-project table (rows link to project detail) |
| `/errors` | Error log; empty state when no errors |
| `/model-pricing` | Per-model rate table + usage breakdown (input/output/cache write/cache read) |

**API routes** (`app/api/`):
- Stats/charts: `stats`, `events/timeline`, `activity/heatmap`, `tokens`, `tokens/timeline`
- Projects: `projects`, `projects/detail`
- Sessions: `sessions`, `sessions/[id]`, `sessions/[id]/events`, `sessions/[id]/transcript`, `sessions/[id]/export`, `sessions/[id]/summary`
- Tools: `tools`, `tools/[name]`
- Errors / agents / insights: `errors`, `agents`, `insights`
- Settings: `settings`
- Chat (interactive): `chat/stream`, `chat/respond`, `chat/directories`, `chat/filetree`, `chat/filecontent`, `chat/fileraw`, `chat/filesearch`, `chat/browse`, `chat/fileops`, `chat/saveimage`

## Key Implementation Details

**Tool call pairing**: Each tool use creates two events (`PreToolUse` → `PostToolUse`). Count `PostToolUse` only to avoid doubling; merge into one card in the conversation view using a forward-scan with a `skipIds` Set.

**Subagent type**: The `agent` column stores `"subagent"` literally. The actual type (e.g., `"Explore"`, `"team-lead"`) lives in `raw_payload`:
```sql
COALESCE(NULLIF(json_extract(raw_payload, '$.agent_type'), ''), agent) AS agent_name
```

**Project display name**: `project_dir` is a full path. Extract last segment:
```sql
SUBSTRING_INDEX(project_dir, '/', -1) AS project_name
```

**Session duration**:
```sql
TIMESTAMPDIFF('SECOND', started_at, last_seen_at)
```
Note: the unit string must be quoted in SQLite (it's passed as a UDF argument, not a keyword).

**JSON columns**: SQLite stores JSON as TEXT. All route handlers that read `tool_input`/`tool_output` must call `parseJson()` to convert from string to object. MySQL auto-parsed these; SQLite does not.

**Token cost formula**: per-model (not a single rate). Implemented in `lib/utils.ts` via `calcCost(input, output, cacheWrite, cacheRead, model)` which picks the right rate:

| Model | Input $/M | Output $/M | Cache write $/M | Cache read $/M |
|---|---|---|---|---|
| Opus  | 5  | 25 | 10 | 0.50 |
| Sonnet (default) | 3  | 15 | 6  | 0.30 |
| Haiku | 1  | 5  | 2  | 0.10 |

In SQL, use the per-model `COST_EXPR` `CASE` pattern (see `app/api/projects/detail/route.ts` for the canonical form). Model is only populated on `Stop`/`SubagentStop` events — never on `PostToolUse`.

**Pricing constants live in two places** that must stay in sync: `MODEL_PRICING` in `lib/utils.ts` (TypeScript) and the `COST_EXPR` `CASE` block (SQL) repeated across API routes. Changing rates requires touching both.

**Conversations view** (`/conversations`):
- Path-based routing: `/conversations/[id]` — session ID in path, not query param
- **Bidirectional infinite scroll** via `before_id` / `after_id` pagination (50 events/page each direction)
- **Focus mode**: `?focus=<event_id>` URL param loads a 50-event slice centered on that event (25 before + 25 after) and applies an amber outline highlight for 2s via the `[data-focused="true"]` attribute. Used by the Session Summary `↗` jump icon.
- Two tabs in the right pane: **Conversation** (raw event thread) and **Summary** (panel-mode `SessionSummary` with Prompts list)
- "Ask Claude" button navigates to `/chat/[id]` with session pre-loaded as context
- "Export" button downloads self-contained HTML via `/api/sessions/[id]/export`

**Session Summary** (`/conversations/[id]/summary` and the Summary tab):
- Each row in the **Prompts** section is a "moment" anchored on one `UserPromptSubmit` event + everything until the next prompt (or session end).
- Per-prompt fields: timestamp, prompt text (120 chars), turn count, file edits count, cost, top 3 tools, response excerpt (last main-agent assistant content in the window, 180 chars, markdown stripped).
- API: `/api/sessions/[id]/summary` returns `header`, `participants`, `model_breakdown`, `prompts[]`.
- Empty state: triggered when `header.turn_count === 0 && header.total_tokens === 0 && prompts.length === 0`.

**Sidebar**: Auto-collapses on `/chat` routes to give maximum space to the chat interface.

**Assistant content is markdown** — rendered with `react-markdown` (+ `remark-gfm`) in conversation threads. In the Summary's per-prompt response excerpt, markdown is **stripped** (fenced code blocks and inline code removed, newlines collapsed) before truncation, so the row stays scannable.

## Insight rules

15-rule library documented in `docs/product/insight-specs/`. Each spec is a markdown file defining a single rule's unit, SQL, edge cases, and validation dry-run. Implementation lives in `app/api/insights/route.ts`. The `/` dashboard surfaces top-3 active insights via `RecommendationsSection`.

When editing or adding a rule: define the unit, enumerate edge cases, and dry-run the SQL against the live DB before shipping. Pattern lives in the agent prompt at `.claude/agents/insights-engineer.md`.

## Key Utilities

`lib/utils.ts`:
- Formatters: `formatTokens(n)` (`1234567` → `"1.23M"`), `formatCost(dollars)`, `formatMs(ms)`, `formatDuration(seconds)`, `formatRelativeTime`, `formatAbsoluteTime`
- Cost: `calcCost(input, output, cacheWrite, cacheRead, model?)`, `formatCacheAnnotation`, `TOKEN_PRICING`, `MODEL_PRICING`
- Dates: `parseDbDate(str)` (handles `"YYYY-MM-DD HH:mm:ss"` and ISO), `toSqliteTimestamp`
- Charts: `CT`, `AXIS_TICK`, `GRID_STROKE`, `CHART_COLORS`, `EVENT_TYPE_COLORS`, `TOOL_COLORS`, `cn`

`lib/colors.ts`:
- Per-domain palettes: `ROLE_COLORS`, `TOOL_COLORS`, `TOKEN_COLORS`, `BUBBLE_COLORS`, `AGENT_COLORS`
- Helpers: `getToolColor(name)`, `getAgentColor(name, colorHint?)` (hash-based stable color for unknown agents)

> **Note**: `TOOL_COLORS` is exported from both files. Imports from `lib/colors.ts` are the canonical source — `lib/utils.ts` retains the older export for legacy callers.

`lib/db.ts`: shared `better-sqlite3` pool wrapped to a `mysql2`-compatible interface (`pool.query<RowDataPacket[]>`).

`lib/types.ts`: shared TS types (`Session`, etc).

`lib/active-streams.ts`, `lib/claude-process.ts`: chat infrastructure for `/chat` (streaming, process spawn).

## Shared Components

Most components are page-local; these are the cross-page primitives:

- `components/session-table.tsx` — paginated session table; `showSessionId` prop swaps the first column for project-scoped views
- `components/session-summary.tsx` — `SessionSummary` (panel + page modes), `PromptsSection`, `PromptRow`
- `components/conversation-thread.tsx` — raw event thread (used in `/conversations` and the chat replay)
- `components/tool-call-card.tsx` — per-tool render dispatch; 23 renderers cover the main tools
- `components/task-notification-card.tsx` — renders agent task notification payloads (`<task-notification>` content)
- `components/cost-mix-row.tsx` — shared cost-mix bar + expandable row (used in `/model-pricing` and `/projects/detail`)
- `components/pagination.tsx` — shared `PaginationInfo` + `PaginationLinks` (used in `/sessions` and `/projects/detail`)
- `components/scope-picker.tsx` — unified URL-driven date-scope chips (7d/30d/90d/All)
- `components/stat-card.tsx`, `components/header.tsx`, `components/sidebar.tsx` — layout primitives
- `components/budget-panel.tsx`, `components/recommendations-section.tsx` — dashboard cards
- `components/session-view-shell.tsx` — Conversation/Summary tab shell for `/conversations/[id]`

## Agent team (`.claude/agents/`)

This project uses Claude Code's native agent teams. The active roster is **8 agents** — 5 operational + 1 specialist + 2 audit roles. Each has a `.claude/agents/<name>.md` prompt with role definition, boundaries ("What you do NOT do" + "When you find yourself out of scope"), and a self-improvement loop.

### Operational team (build and ship)

| Agent | Model | Role |
|---|---|---|
| `ceo` | Opus 4.7 | Strategy, priority, trade-offs. **Custodian of the harness-engineering methodology** (`.claude/skills/harness-engineering/SKILL.md`). Default agent. Never writes code. |
| `team-lead` | Sonnet | Operational coordinator. Dispatches engineering work. Owns sign-off discipline. |
| `engineer` | Sonnet | Full-stack TS/React/SQL execution. Type-check + data-verification discipline. Reports to team-lead. |
| `ui-ux` | Sonnet | Visual decisions, design system, dark/light parity, accessibility. Caps iteration at 2 per layout. |
| `pm` | Sonnet | Scoping, naming, user-facing copy, insight rule body text. Owns user-value filter. |

### Specialist (rule library)

| Agent | Model | Role |
|---|---|---|
| `insights-engineer` | Opus 4.7 | Owns the 15-rule insight library in `app/api/insights/route.ts` + specs in `docs/product/insight-specs/`. Opus because rule correctness is non-negotiable. |

### Audit roles (one-shot reviewers, no downstream dispatch)

| Agent | Model | Role |
|---|---|---|
| `new-user` | Haiku | Fresh-eyes UX audit. Persona: never seen any AI dev tool. Tests first-impression value in 5 seconds. Haiku because the value is in fast vibe signal. |
| `claude-dev-guest` | Sonnet | Ecosystem-fit audit. Persona: power user of Claude CLI + VS Code extension + standalone software + Anthropic SDK. Tests whether this dashboard fits an existing Claude Code workflow. |

### Org chart

```
                              CEO
                               │
            ┌────────────┬─────┴────┬────────────┐
            │            │          │            │
          ui-ux     team-lead       pm       audit roles
                         │                      │
            ┌────────────┴──────────────┐   ┌───┴───────────────┐
            │                           │   │                   │
         engineer            insights-engineer  new-user   claude-dev-guest
```

CEO dispatches directly to ui-ux, pm, or the audit roles. CEO must NOT skip team-lead to dispatch engineer or insights-engineer.

## Logger Script

`log-to-db.py` (repo root) is the Claude Code hook script. `npm run init` copies it to `~/.claude/log-to-db.py`, sets `chmod 700`, and registers all 7 event hooks in `~/.claude/settings.json`.

It uses Python's built-in `sqlite3` module — no pip dependencies required. Database path is read from `DB_PATH` env var, defaulting to `~/.claude-dashboard/dashboard.db`.

**Model availability**: the logger populates `model` + token columns on `Stop` and `SubagentStop` events only. `PostToolUse` rows have NULL model. Any rule or query that needs model must read from Stop/SubagentStop.

## Setup

```bash
npm install && npm run init && npm run dev
```

Schema source of truth: `migrations/001_schema.sql` + `migrations/002_settings.sql`

## Scripts

- `scripts/init.js` — install logger + register hooks (called by `npm run init`)
- `scripts/log-to-db.py` (repo root) — the hook logger itself
- `scripts/audit-page.mjs` — Playwright desktop + mobile screenshot capture for visual audits: `node scripts/audit-page.mjs <url> <output-dir>`

## Design

Linear/Vercel aesthetic. Dark mode default, light mode toggle via `next-themes`. CSS variable color tokens in `app/globals.css`. Cards: `rounded-xl`, subtle border, no heavy shadows. Skeleton loaders on loading states. Always handle empty states with icon + message.
