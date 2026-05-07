# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Next.js 15 (App Router) dashboard that visualizes Claude Code activity stored in a MySQL database. A Python hook logger (`log-to-db.py`) captures every Claude Code event and writes it to MySQL; this dashboard reads and displays it.

## Commands

```bash
npm run dev       # development server (localhost:3000)
npm run build     # production build
npm run lint      # ESLint
npm start         # production server
```

Environment: copy `.env.local.example` → `.env.local` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (database is `claude_logs`).

Database: run `bash migrations/run_migrations.sh -u root -p` once to create all tables.

## Architecture

**Tech stack**: Next.js 15 App Router · Tailwind CSS · shadcn/ui · Recharts · mysql2 (promise pool) · Lucide React · date-fns · react-markdown · next-themes

**Database** — two tables in `claude_logs` MySQL DB:

`cc_sessions`:
- `session_id` (PK), `started_at`, `last_seen_at`, `cwd`, `project_dir`, `model`

`cc_events`:
- `id` (PK), `session_id`, `timestamp` (TIMESTAMP(3)), `event_type`, `agent`, `role`, `content` (LONGTEXT)
- `tool_name`, `tool_input` (JSON), `tool_output` (JSON)
- `is_error`, `error_message`, `raw_payload` (JSON), `transcript_path`
- `model`, `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `total_tokens`
- `duration_ms`

**Data access pattern**: All DB queries in API route handlers (`app/api/...`). No direct DB access from client components. Shared pool in `lib/db.ts`.

**Seven pages**:
| Route | Purpose |
|---|---|
| `/` | Dashboard — stat cards, token summary strip, activity timeline, tool usage chart, recent sessions, agent donut |
| `/projects` | Card grid per `project_dir` |
| `/sessions` | Paginated table with project/date/error filters |
| `/conversations` | Chat-replay — session sidebar (left) + scrollable event thread (right), auto-refreshes every 15s |
| `/tools` | Tool analytics — usage chart, per-tool table with avg/max duration |
| `/tokens` | Token usage — totals, cost estimation, timeline chart, model breakdown donut, cost-by-project bar chart |
| `/errors` | Error log; empty state when no errors |

**Eleven API routes** (`app/api/`):
`stats`, `events/timeline`, `projects`, `sessions`, `sessions/[id]`, `sessions/[id]/events`, `tools`, `tools/[name]`, `errors`, `agents`, `tokens`, `tokens/timeline`

## Key Implementation Details

**Tool call pairing**: Each tool use creates two events (`PreToolUse` → `PostToolUse`). Count `PostToolUse` only to avoid doubling; merge into one card in the conversation view using a forward-scan with a `skipIds` Set.

**Subagent type**: The `agent` column stores "subagent" literally. Actual type (e.g., "Explore") is in `raw_payload.agent_type`:
```sql
JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.agent_type'))
```

**Project display name**: `project_dir` is a full path. Extract last segment:
```sql
SUBSTRING_INDEX(project_dir, '/', -1) AS project_name
```

**Session duration**:
```sql
TIMESTAMPDIFF(SECOND, started_at, last_seen_at)
```

**Token cost formula** (Sonnet pricing, implemented in `lib/utils.ts`):
```
cost = input × $3/M + output × $15/M + cache_write × $3.75/M + cache_read × $0.30/M
```
Use `calcCost(input, output, cacheWrite, cacheRead)` from `lib/utils.ts`.

**Assistant content is markdown** — rendered with `react-markdown` in the conversation thread.

**Conversations auto-refresh**: every 15 seconds the client polls both `/api/sessions?limit=100` (sidebar list) and the active session's events. Scroll-to-bottom fires on initial load (`instant`) and on new events (`smooth`) via a `ref` at the thread end.

## TypeScript Interfaces

All types live in `lib/types.ts`:

- `Session` — includes `duration_seconds`, `tools_used: string[]`, `agent_types`, `error_count`
- `Event` — `event_type` union: `'SessionStart' | 'UserPromptSubmit' | 'Stop' | 'SubagentStop' | 'PreToolUse' | 'PostToolUse' | 'Notification'`
- `ProjectStats`, `ToolStats` — `ToolStats` includes `avg_duration_ms`, `max_duration_ms`
- `StatsOverview`, `TimelinePoint`, `AgentStats`
- `TokenTotals` — totals + `total_cost` + `cache_efficiency`
- `ProjectTokenStats` — per-project token breakdown + `cost`
- `ModelStats` — per-model token breakdown + `cost`
- `TokenTimelinePoint` — time-bucketed token counts + `cost`

## Key Utilities (`lib/utils.ts`)

- `formatTokens(n)` — `1234567` → `"1.23M"`
- `formatCost(dollars)` — `0.0012` → `"$0.0012"`
- `formatMs(ms)` — `1500` → `"1.5s"`
- `formatDuration(seconds)` — `90` → `"1m 30s"`
- `calcCost(input, output, cacheWrite, cacheRead)` — returns dollar amount
- `TOKEN_PRICING` — cost per token constants
- `CHART_COLORS`, `EVENT_TYPE_COLORS`, `TOOL_COLORS` — shared color maps

## Logger Script

`log-to-db.py` (repo root) is the Claude Code hook script. Copy to `~/.claude/log-to-db.py`, set the password in `DB_CONFIG`, then `chmod 700`. It captures all 7 event types and writes token usage (summed from the transcript JSONL on Stop/SubagentStop events) and `duration_ms` (from PostToolUse payload).

## Design

Linear/Vercel aesthetic. Dark mode default, light mode toggle via `next-themes`. CSS variable color tokens in `app/globals.css` (`--chart-blue`, `--chart-rose`, etc.). Cards: `rounded-xl`, subtle border, no heavy shadows. Skeleton loaders on loading states. Always handle empty states with icon + message.
