# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Next.js 15 (App Router) dashboard that visualizes Claude Code activity stored in a local SQLite database. A Python hook logger (`log-to-db.py`) captures every Claude Code event and writes it to SQLite; this dashboard reads and displays it.

## Commands

```bash
npm run dev       # development server (localhost:3000)
npm run build     # production build
npm run lint      # ESLint
npm start         # production server
npm run init      # one-time setup: installs logger, registers hooks, creates DB
```

Environment: copy `.env.local.example` → `.env.local`. Only two variables matter:
- `DB_PATH` — path to SQLite DB (default: `~/.claude/dashboard.db`)
- `NEXT_PUBLIC_APP_URL` — base URL for server-side fetches (default: `http://localhost:3000`)

## Architecture

**Tech stack**: Next.js 15 App Router · Tailwind CSS · shadcn/ui · Recharts · better-sqlite3 · Lucide React · date-fns · react-markdown · next-themes

**Database** — SQLite at `~/.claude/dashboard.db`. Four tables:

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

**Data access**: All DB queries in API route handlers (`app/api/...`). No direct DB access from client components. Shared SQLite connection in `lib/db.ts`.

**lib/db.ts** registers three MySQL-compatible SQLite UDFs so SQL in routes doesn't need changing:
- `SUBSTRING_INDEX(str, delim, count)` — extracts path segments
- `TIMESTAMPDIFF('SECOND', start, end)` — returns duration in seconds
- `JSON_LENGTH(json)` — returns array/object length

**Eight pages**:
| Route | Purpose |
|---|---|
| `/` | Dashboard — stat cards, token summary strip, activity timeline, tool usage chart, recent sessions, agent donut |
| `/projects` | Card grid per `project_dir` |
| `/sessions` | Paginated table with project/date/error filters |
| `/conversations` | Read-only chat replay — session sidebar + scrollable event thread, load-older scroll, HTML export, Ask Claude button |
| `/chat` | Live interactive Claude chat — file explorer, Monaco editor, streaming *(Experimental)* |
| `/tools` | Tool analytics — usage chart, per-tool table with avg/max duration |
| `/tokens` | Token usage — totals, cost estimation, timeline chart, model breakdown donut, cost-by-project bar chart |
| `/errors` | Error log; empty state when no errors |

**API routes** (`app/api/`):
`stats`, `events/timeline`, `activity/heatmap`, `projects`, `sessions`, `sessions/[id]`, `sessions/[id]/events`, `sessions/[id]/transcript`, `sessions/[id]/export`, `tools`, `tools/[name]`, `errors`, `agents`, `tokens`, `tokens/timeline`, `chat/stream`, `chat/directories`, `chat/filetree`, `chat/filecontent`, `chat/fileraw`, `chat/filesearch`, `chat/browse`, `chat/fileops`, `chat/saveimage`

## Key Implementation Details

**Tool call pairing**: Each tool use creates two events (`PreToolUse` → `PostToolUse`). Count `PostToolUse` only to avoid doubling; merge into one card in the conversation view using a forward-scan with a `skipIds` Set.

**Subagent type**: The `agent` column stores "subagent" literally. Actual type (e.g., "Explore") is in `raw_payload`:
```sql
json_extract(raw_payload, '$.agent_type')
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

**Token cost formula** (per-model, implemented in `lib/utils.ts`):
```
cost = input × $3/M + output × $15/M + cache_write × $3.75/M + cache_read × $0.30/M
```
Use `calcCost(input, output, cacheWrite, cacheRead)` from `lib/utils.ts`.

**Conversations view** (`/conversations`):
- Path-based routing: `/conversations/[id]` — session ID in path, not query param
- Upward infinite scroll via `before_id` pagination (50 events/page)
- "Ask Claude" button navigates to `/chat/[id]` with session pre-loaded as context
- "Export" button downloads self-contained HTML via `/api/sessions/[id]/export`

**Sidebar**: Auto-collapses on `/chat` routes to give maximum space to the chat interface.

**Assistant content is markdown** — rendered with `react-markdown` in conversation threads.

## Key Utilities (`lib/utils.ts`)

- `formatTokens(n)` — `1234567` → `"1.23M"`
- `formatCost(dollars)` — `0.0012` → `"$0.0012"`
- `formatMs(ms)` — `1500` → `"1.5s"`
- `formatDuration(seconds)` — `90` → `"1m 30s"`
- `calcCost(input, output, cacheWrite, cacheRead)` — returns dollar amount
- `parseDbDate(str)` — handles both `"YYYY-MM-DD HH:mm:ss"` and ISO strings
- `TOKEN_PRICING`, `CHART_COLORS`, `EVENT_TYPE_COLORS`, `TOOL_COLORS` — shared constants

## Logger Script

`log-to-db.py` (repo root) is the Claude Code hook script. `npm run init` copies it to `~/.claude/log-to-db.py`, sets `chmod 700`, and registers all 7 event hooks in `~/.claude/settings.json`.

It uses Python's built-in `sqlite3` module — no pip dependencies required. Database path is read from `DB_PATH` env var, defaulting to `~/.claude/dashboard.db`.

## Setup

```bash
npm install && npm run init && npm run dev
```

Schema source of truth: `migrations/001_schema.sql`

## Design

Linear/Vercel aesthetic. Dark mode default, light mode toggle via `next-themes`. CSS variable color tokens in `app/globals.css`. Cards: `rounded-xl`, subtle border, no heavy shadows. Skeleton loaders on loading states. Always handle empty states with icon + message.
