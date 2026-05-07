# Claude Code Activity Dashboard — Build Prompt

## Project Overview

Build a **Next.js 14+ (App Router)** dashboard that visualizes all Claude Code activity logged into a MySQL database. The dashboard reads from two tables (`cc_sessions` and `cc_events`) that capture every prompt, response, tool call, error, and subagent action from Claude Code sessions across all projects.

The dashboard must have a **clean, modern UI** — think Linear/Vercel aesthetic. Dark mode by default with a light mode toggle. No cluttered charts. Every pixel intentional.

---

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **UI**: Tailwind CSS + shadcn/ui components
- **Charts**: Recharts
- **Database**: MySQL via `mysql2` package (promise-based)
- **State**: React Server Components where possible, client components only for interactivity
- **Icons**: Lucide React
- **Fonts**: Inter (via next/font)

---

## Database Schema

The dashboard connects to a MySQL database called `claude_logs`. Connection config should be read from environment variables:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=claude
DB_PASSWORD=<from_env>
DB_NAME=claude_logs
```

### Table: `cc_sessions`

```sql
CREATE TABLE cc_sessions (
    session_id      VARCHAR(255) PRIMARY KEY,   -- UUID
    started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cwd             TEXT,                       -- working directory when session started
    project_dir     TEXT                        -- project root (often same as cwd)
);
```

### Table: `cc_events`

```sql
CREATE TABLE cc_events (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(255) NOT NULL,      -- FK to cc_sessions
    timestamp       TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    event_type      VARCHAR(64) NOT NULL,       -- see event types below
    agent           VARCHAR(128),               -- 'main' or subagent name (e.g., 'subagent')
    role            VARCHAR(32),                -- 'user' | 'assistant' | 'tool' | 'system' | NULL
    content         LONGTEXT,                   -- prompt text, response text, or NULL
    tool_name       VARCHAR(128),               -- e.g., 'Write', 'Bash', 'Read', 'Agent', 'Skill', 'Glob'
    tool_input      JSON,                       -- tool arguments as JSON
    tool_output     JSON,                       -- tool response as JSON
    is_error        BOOLEAN DEFAULT FALSE,
    error_message   TEXT,
    raw_payload     JSON,                       -- full hook payload (always present)
    transcript_path TEXT                         -- path to JSONL transcript file
);
```

### Event Types (and what they mean)

| event_type | role | What it captures |
|---|---|---|
| `SessionStart` | NULL | New session opened. `raw_payload` has `cwd`, `source` (e.g., "resume") |
| `UserPromptSubmit` | user | User typed a prompt. `content` = the prompt text |
| `Stop` | assistant | Claude's final reply. `content` = the response text. `agent` = "main" |
| `SubagentStop` | assistant | A subagent finished. `content` = its reply. `raw_payload` has `agent_type` (e.g., "Explore") |
| `PreToolUse` | tool | Tool about to run. `tool_name` + `tool_input` set. No output yet |
| `PostToolUse` | tool | Tool finished. `tool_name` + `tool_input` + `tool_output` set. `is_error` + `error_message` if failed |
| `Notification` | system | System notification (e.g., "Claude needs your permission to use Write") |

### Real Data Profile (current)

- ~13 sessions, ~112 events, growing daily
- 5 active projects (by `project_dir`)
- Agents: "main" (109 events), "subagent" (3 events)
- Subagent types in raw_payload: "Explore"
- Tools: Write (44), Bash (30), Read (5), Agent (4), Skill (2), Glob (2)
- Avg events per session: 8.6
- Content lengths: user prompts avg 313 chars, assistant replies avg 692 chars
- 0 errors so far (but the column will populate)

### Extracting Subagent Type

The `agent` column just says "subagent" — the specific type (e.g., "Explore") is in `raw_payload`:

```sql
SELECT JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.agent_type')) AS agent_type
FROM cc_events WHERE event_type = 'SubagentStop';
```

### Extracting Project Name from project_dir

The `project_dir` is a full path like `/Users/aayushsaini/projects/property_rental_management`. Extract the last segment as the display name:

```sql
SELECT SUBSTRING_INDEX(project_dir, '/', -1) AS project_name
```

---

## Pages & Layout

### Global Layout

- **Sidebar** (left, collapsible): navigation with icons
  - Dashboard (overview)
  - Projects
  - Sessions
  - Conversations
  - Tools
  - Errors
- **Header**: page title, dark/light mode toggle, auto-refresh toggle (30s interval)
- **Color palette**: use CSS variables. Dark mode: slate-900/950 bg, slate-100 text, blue-500 accent. Light mode: white bg, slate-900 text, blue-600 accent.

### Page 1: Dashboard (Overview) — `/`

The landing page. At-a-glance stats + trends.

**Top row — 4 stat cards (horizontal):**
- Total Sessions (count from cc_sessions)
- Total Events (count from cc_events)
- Active Projects (distinct project_dir count)
- Error Rate (is_error=true / total events, as percentage, red if >5%)

Each card shows: icon, label, big number, and a small sparkline or delta vs previous period.

**Middle row — 2 charts side by side:**
1. **Activity Over Time** (area chart): events per hour/day on x-axis, count on y-axis. Color-coded by event_type. Default to last 7 days, with a date range picker.
2. **Tool Usage** (horizontal bar chart): tool_name on y-axis, count on x-axis. Only PostToolUse events. Sorted descending.

**Bottom row — 2 panels:**
1. **Recent Sessions** (table/list): last 10 sessions, showing project name (extracted from path), started_at (relative time like "2 hours ago"), event count, and whether any errors occurred (red dot if yes). Clickable → goes to session detail.
2. **Agent Breakdown** (donut chart): main vs subagent event counts. If subagents exist, show their types extracted from raw_payload.

### Page 2: Projects — `/projects`

**Project cards grid**: one card per unique `project_dir`. Each card shows:
- Project name (last path segment, displayed as title-case or as-is)
- Full path (small, muted text)
- Total sessions
- Total events
- Most used tool (top tool_name for that project)
- Last active (relative time from latest event)
- Error count (red badge if >0)

Clicking a card → filters the Sessions page to that project.

**Below the grid**: a stacked bar chart showing tool usage breakdown per project.

### Page 3: Sessions — `/sessions`

**Filterable table** of all sessions:

| Column | Source |
|---|---|
| Session ID | cc_sessions.session_id (truncated, with copy button) |
| Project | Extracted from project_dir |
| Started | started_at, relative + absolute on hover |
| Duration | last_seen_at - started_at |
| Events | COUNT from cc_events |
| Tools Used | Distinct tool_name badges |
| Errors | Count where is_error=true, red if >0 |
| Agent | "main" or shows subagent types used |

**Filters**: project dropdown, date range, has-errors toggle.

Clicking a row → goes to session detail/conversation view.

### Page 4: Conversations — `/conversations`

**This is the most important interactive page.** It lets you replay a full Claude Code session as a chat thread.

**Left panel (1/3 width)**: session list with search. Shows project name + first prompt preview + timestamp. Sortable by date.

**Right panel (2/3 width)**: the conversation thread for the selected session. Render events in `id` order as a chat-like interface:

- **UserPromptSubmit** → user bubble (right-aligned, blue-ish bg). Show `content`.
- **Stop / SubagentStop** → assistant bubble (left-aligned, dark bg). Show `content`. If SubagentStop, show a small badge with agent_type.
- **PreToolUse + PostToolUse** → collapsible tool card (left-aligned, subtle border). Show tool name as header, input as collapsible JSON, output as collapsible JSON. If `is_error`, red border + show error_message.
- **Notification** → system message (centered, muted, small text).
- **SessionStart** → timestamp divider.

Each message shows its timestamp (small, muted, relative).

**The conversation view must handle long content gracefully**: markdown rendering for assistant replies (they contain headers, bold, lists, code blocks). Use a markdown renderer like `react-markdown` or `next-mdx-remote` for assistant content.

Tool input/output JSON should be in collapsible `<details>` or accordion with syntax highlighting (use a simple `<pre>` with monospace + subtle bg).

### Page 5: Tools — `/tools`

Analytics focused on tool usage.

**Top row — stat cards**: total tool calls, unique tools, error rate per tool, most used tool.

**Main chart**: tool usage over time (stacked area chart). X-axis = time, Y-axis = count, one series per tool_name.

**Table below**: one row per tool, columns:
- Tool name
- Total calls (Pre + Post combined / 2, since each call has both)
- Error count
- Error rate (%)
- Avg output size (for PostToolUse, AVG of JSON_LENGTH(tool_output)))
- Last used (relative time)

Clicking a tool → shows a filtered list of all calls with their inputs/outputs.

### Page 6: Errors — `/errors`

Only shows events where `is_error = TRUE`.

**If no errors**: show a friendly empty state — green checkmark, "No errors recorded. Everything's running smoothly."

**If errors exist**:
- Timeline chart of errors over time
- Table: timestamp, session (linked), project, tool_name, error_message (full text, expandable), and a link to view in conversation context

---

## API Routes (App Router: `app/api/...`)

Use Next.js Route Handlers. All database queries go through these — no direct DB access from client components.

```
GET /api/stats                  — overview numbers (4 stat cards)
GET /api/events/timeline?days=7 — events grouped by hour/day for chart
GET /api/projects               — project list with aggregated stats
GET /api/sessions?project=X&page=1&limit=20 — paginated sessions
GET /api/sessions/[id]          — single session detail
GET /api/sessions/[id]/events   — all events for a session, ordered by id
GET /api/tools                  — tool usage stats
GET /api/tools/[name]           — all calls for a specific tool
GET /api/errors?page=1&limit=20 — error events paginated
GET /api/agents                 — agent breakdown with subagent types
```

### Database Connection

Create a shared `lib/db.ts` using `mysql2/promise` with a connection pool:

```typescript
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'claude',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'claude_logs',
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
```

---

## Design Guidelines

### Visual Style
- **Inspired by**: Linear, Vercel Dashboard, Raycast
- **Spacing**: generous. Don't cram. Use `gap-6` between cards, `p-6` inside cards.
- **Cards**: subtle border (border-slate-800 dark / border-slate-200 light), rounded-xl, no heavy shadows. Very light hover effect.
- **Tables**: clean, no full grid lines. Subtle bottom borders between rows. Hover highlight.
- **Charts**: minimal. No gridlines or very faint ones. Smooth curves. Muted color palette (don't use bright red/green/blue — use slate-tinted versions).
- **Typography**: Inter font. Page titles 2xl semibold. Card labels sm text-muted. Numbers 3xl font-semibold.
- **Empty states**: always handle them gracefully. Icon + message + suggestion.
- **Loading**: skeleton loaders, not spinners.

### Color Tokens (for charts)
```
--chart-blue: hsl(217, 91%, 60%)       — primary / user prompts
--chart-indigo: hsl(239, 84%, 67%)     — assistant replies
--chart-emerald: hsl(160, 84%, 39%)    — successful tool calls
--chart-amber: hsl(38, 92%, 50%)       — warnings / notifications
--chart-rose: hsl(350, 89%, 60%)       — errors
--chart-slate: hsl(215, 20%, 65%)      — neutral / session events
--chart-violet: hsl(263, 70%, 58%)     — subagent activity
```

### Responsive
- Sidebar collapses to icons on mobile
- Cards stack vertically on small screens
- Conversation view goes single-panel on mobile (session list becomes a dropdown)

---

## File Structure

```
app/
  layout.tsx                    — root layout with sidebar, theme provider
  page.tsx                      — dashboard overview
  projects/page.tsx             — projects grid
  sessions/page.tsx             — sessions table
  sessions/[id]/page.tsx        — redirects to conversation with session pre-selected
  conversations/page.tsx        — conversation replay
  tools/page.tsx                — tool analytics
  errors/page.tsx               — error log
  api/
    stats/route.ts
    events/timeline/route.ts
    projects/route.ts
    sessions/route.ts
    sessions/[id]/route.ts
    sessions/[id]/events/route.ts
    tools/route.ts
    tools/[name]/route.ts
    errors/route.ts
    agents/route.ts
components/
  sidebar.tsx
  stat-card.tsx
  session-table.tsx
  conversation-thread.tsx       — the chat replay component
  tool-call-card.tsx            — collapsible tool input/output
  project-card.tsx
  charts/
    activity-timeline.tsx
    tool-usage-bar.tsx
    agent-donut.tsx
    error-timeline.tsx
  ui/                           — shadcn components
lib/
  db.ts                         — MySQL pool
  utils.ts                      — date formatting, project name extraction, etc.
  types.ts                      — TypeScript interfaces for Session, Event, etc.
```

---

## TypeScript Interfaces

```typescript
interface Session {
  session_id: string;
  started_at: string;
  last_seen_at: string;
  cwd: string;
  project_dir: string;
  project_name: string;         // derived: last segment of project_dir
  event_count: number;          // derived: COUNT of events
  error_count: number;          // derived: COUNT where is_error
  tools_used: string[];         // derived: DISTINCT tool_name
}

interface Event {
  id: number;
  session_id: string;
  timestamp: string;
  event_type: 'SessionStart' | 'UserPromptSubmit' | 'Stop' | 'SubagentStop' | 'PreToolUse' | 'PostToolUse' | 'Notification';
  agent: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | null;
  content: string | null;
  tool_name: string | null;
  tool_input: Record<string, any> | null;
  tool_output: Record<string, any> | null;
  is_error: boolean;
  error_message: string | null;
  raw_payload: Record<string, any>;
  transcript_path: string | null;
}

interface ProjectStats {
  project_dir: string;
  project_name: string;
  total_sessions: number;
  total_events: number;
  error_count: number;
  top_tool: string;
  last_active: string;
}

interface ToolStats {
  tool_name: string;
  total_calls: number;
  error_count: number;
  error_rate: number;
  last_used: string;
}
```

---

## Important Implementation Notes

1. **Auto-refresh**: add a toggle in the header. When enabled, re-fetch data every 30 seconds using `setInterval` + `router.refresh()` or SWR/React Query with polling. Default: OFF.

2. **Project name extraction**: `project_dir` is a full path. Always show just the last segment as the display name, full path on hover/tooltip.

3. **Subagent type**: the `agent` column just says "subagent". The actual type (e.g., "Explore") lives in `raw_payload.agent_type`. Extract it with `JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.agent_type'))`.

4. **Tool call pairing**: each tool use generates TWO events (PreToolUse → PostToolUse). When counting "tool calls", count PostToolUse only to avoid doubling. When showing in conversation view, merge them into one card.

5. **Markdown in assistant replies**: assistant content contains markdown (headers, bold, lists, code blocks). Render it properly in the conversation view.

6. **Time formatting**: use relative times ("2 hours ago") with absolute timestamps on hover. Use a library like `date-fns` or `dayjs`.

7. **Pagination**: sessions and events tables must be paginated. Default 20 per page.

8. **The data will grow**: optimize queries with proper WHERE clauses and LIMIT. Don't SELECT * from cc_events without filters.

9. **Environment variables**: all DB credentials via `.env.local`, never hardcoded.

10. **Session duration**: calculate as `TIMESTAMPDIFF(SECOND, s.started_at, s.last_seen_at)` and format as "2m 30s" or "1h 15m".
