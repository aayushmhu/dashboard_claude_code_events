# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Next.js 14+ (App Router) dashboard that visualizes Claude Code activity stored in a MySQL database.

## Commands

```bash
npm run dev       # development server (localhost:3000)
npm run build     # production build
npm run lint      # ESLint
npm start         # production server
```

Environment: copy `.env.local.example` → `.env.local` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (database is `claude_logs`).

## Architecture

**Tech stack**: Next.js 14 App Router · Tailwind CSS · shadcn/ui · Recharts · mysql2 (promise pool) · Lucide React · date-fns

**Database**: Two tables in `claude_logs` MySQL DB:
- `cc_sessions` — one row per Claude Code session (`session_id`, `started_at`, `last_seen_at`, `cwd`, `project_dir`)
- `cc_events` — all events: prompts, responses, tool calls, errors (`event_type`, `role`, `content`, `tool_name`, `tool_input`, `tool_output`, `is_error`, `raw_payload`)

**Data access pattern**: All DB queries happen in API route handlers (`app/api/...`). No direct DB access from client components. Shared pool in `lib/db.ts`.

**Six pages**:
| Route | Purpose |
|---|---|
| `/` | Overview — stat cards, activity timeline chart, tool usage bar chart, recent sessions, agent donut |
| `/projects` | Card grid per `project_dir`, stacked tool usage chart below |
| `/sessions` | Paginated filterable table with project/date/error filters |
| `/conversations` | Chat-replay view — session list (left 1/3) + event thread (right 2/3) |
| `/tools` | Tool analytics — usage over time chart + per-tool stats table |
| `/errors` | Error log; shows empty state (green checkmark) when `is_error` count = 0 |

**Nine API routes** (`app/api/`): `stats`, `events/timeline`, `projects`, `sessions`, `sessions/[id]`, `sessions/[id]/events`, `tools`, `tools/[name]`, `errors`, `agents`.

## Key Implementation Details

**Tool call pairing**: Each tool use creates two events (`PreToolUse` → `PostToolUse`). Count `PostToolUse` only to avoid doubling; merge into one card in the conversation view.

**Subagent type**: The `agent` column only says "subagent". Actual type (e.g., "Explore") lives in `raw_payload.agent_type`:
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

**Assistant content is markdown** — use `react-markdown` or `next-mdx-remote` to render it in the conversation thread.

**Auto-refresh**: optional header toggle, 30-second polling via `router.refresh()` or SWR, default OFF.

## TypeScript Interfaces

Core types live in `lib/types.ts`: `Session`, `Event`, `ProjectStats`, `ToolStats`. The `Event.event_type` union: `'SessionStart' | 'UserPromptSubmit' | 'Stop' | 'SubagentStop' | 'PreToolUse' | 'PostToolUse' | 'Notification'`.

## Design

Linear/Vercel aesthetic. Dark mode default, light mode toggle. CSS variable color tokens defined in spec (`--chart-blue`, `--chart-rose`, etc.). Cards: `rounded-xl`, subtle border, no heavy shadows. Skeleton loaders (not spinners). Always handle empty states with icon + message.
