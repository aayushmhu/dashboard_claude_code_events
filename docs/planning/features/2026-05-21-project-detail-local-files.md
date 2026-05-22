# Project Detail — Local Claude Code files section

| Field | Value |
|---|---|
| Status | shipped |
| Started | 2026-05-21 |
| Shipped | 2026-05-21 |
| SRS row | — |
| Test cases | TC-LF-01..18 |
| Prototype todo | — |

## 1. Requirement (as given)

> "Now Discussed Few things that are a part from the database work it's based on the local files and folder. i saw inside the .claude folder has a folder projects and inside that there are folders based on the projects so and inside there have sessions folders and the transcript of session and the memory of each projects are saved their so i want to add one more section on the project detail page that bring in fronte these files and folders"
>
> "what i just thought show the memory on project detail page and also give options to view full details of your local project and then open that folder into the editor?"
>
> Provided directory listing for `~/.claude/projects/-Users-aayushsaini-projects-dashboard-claude-code-events`:
> - 11 `<session-uuid>.jsonl` files (transcripts)
> - 4 `<session-uuid>/` directories (subagent data)
> - 1 `memory/` directory (project memory + retro logs)

**Distilled goal (revised after iteration 3)**: surface the local Claude Code project files on `/projects/detail?project=<path>` in three forms:

1. **Inline section** on the Project Detail page — surfaces the project memory directly (rendered markdown teaser of MEMORY.md), plus transcript count + a "View all local files" link + an "Open in app editor" button.
2. **Dedicated full-details page** at `/projects/detail/local?project=<path>` — full transcripts table, full memory file listing where each row has a **View** button that opens a **modal popup with the file's full markdown preview** (using the existing react-markdown rendering), subagent dir details.
3. **"Open in app editor" action** — uses the existing in-app `/chat` page (Monaco editor + file explorer) by navigating to `/chat?root=<claude-folder-path>`. No external shell execution; no `$EDITOR` env var; entirely in-app.

## 2. Plan

### 2.1 Rule-by-rule analysis (AGENTS.md Rules)

- **Rule 1**: `npx tsc --noEmit` must pass at commit time.
- **Rule 2**: when this ships, update `feature_list.json` (new entry → passing), append to `claude-progress.md`, update `session-handoff.md`, fill §5/§6/§7 of this planning file. CLAUDE.md audit checklist: Pages table no change, API routes list **adds** `projects/local-files` (or similar), Agent team no change, Database no change, Tech stack no new deps, Shared Components no new shared.
- **Rule 3**: this becomes the active feature. summary-003 + rules-audit-001 stay `not_started`.
- **Rule 4**: no drive-by refactors. Don't touch the existing Sessions table, Cost timeline, Cost-by-Model, Top Tools/Agents Used, or Errors sections. Pure additive.
- **Rule 5**: this file. ✓
- **Rule 6**: trust the continuity artifacts; the design here was specced once already in this conversation.
- **Rule 7**: any decisions made during implementation (e.g., preview length, click behavior) get recorded in §5.
- **Rule 8/9**: no schema changes; no new DB columns.
- **Rule 10/11**: L1 typecheck + L2 dev-server render + L3 (Playwright screenshot of the new section + manual check that .jsonl counts match the local filesystem).
- **Rule 12/13**: standard session start/end discipline.
- **Rule 14**: keep AGENTS.md / CLAUDE.md ≤ 200 lines. This feature adds ~1 line to CLAUDE.md's API routes list and ~1 row to its Pages list narrative. Tiny.
- **Rule 15**: all paths in code use `os.homedir()` + `path.join()`. All paths in docs/planning use `~/` or relative.

### 2.2 Files to touch (revised — 2 endpoints + new page + section + modal + /chat extension)

| File | Why |
|---|---|
| `app/api/projects/local-files/route.ts` (new) | Reads filesystem metadata: transcripts + subagent dirs + memory list |
| `app/api/projects/local-files/memory/route.ts` (new) | Returns content of a specific memory file (markdown body, 1MB cap, path-traversal blocked) |
| `app/chat/page.tsx` and/or `app/chat/client.tsx` | Read `?root=<path>` query param; if set + path validates as inside `~/.claude/projects/`, point the file explorer at that root on initial load |
| `app/projects/detail/page.tsx` | Fetch the metadata endpoint + render the inline section |
| `app/projects/detail/local-files-section.tsx` (new) | Inline section: MEMORY.md teaser (rendered markdown), stats line, "View all local files →" link, "Open in app editor" button (navigates to `/chat?root=<encoded>`) |
| `app/projects/detail/local/page.tsx` (new) | Dedicated full-details page at `/projects/detail/local?project=<path>` |
| `app/projects/detail/local/local-files-client.tsx` (new) | Client component: full transcripts table + memory listing with **View buttons** + subagent dirs + "Open in app editor" button |
| `app/projects/detail/local/memory-preview-modal.tsx` (new) | Modal component for the memory file popup (calls Endpoint 2 to fetch content, renders with react-markdown) |
| `components/ui/dialog.tsx` (new) | shadcn-style Dialog primitive built on `@radix-ui/react-dialog`. Reusable for any future modal in the project. |
| `package.json` | Add `@radix-ui/react-dialog` dependency. Engineer runs `npm install @radix-ui/react-dialog` then verifies `npm install` cleanly. |
| `CLAUDE.md` | Add new routes to Pages + API routes lists; mention the chat `?root=` extension; mention the new shared Dialog primitive |
| `feature_list.json` | New entry, status `active` → `passing` on ship |
| `claude-progress.md`, `session-handoff.md` | End-of-session updates |
| `docs/planning/features/2026-05-21-project-detail-local-files.md` | This file — §5, §6, §7 filled on ship |

### 2.3 Path mapping

The Claude Code projects folder uses a deterministic slug:

- Repo path: `/Users/aayushsaini/projects/dashboard_claude_code_events`
- Claude folder: `~/.claude/projects/-Users-aayushsaini-projects-dashboard-claude-code-events`

Algorithm: take the repo's absolute path, replace every `/` with `-`. Note: the resulting slug starts with `-` because absolute paths start with `/`.

Implementation:
```ts
function projectSlug(repoPath: string): string {
  return repoPath.replace(/\//g, '-');
}
function claudeFolderPath(repoPath: string): string {
  return path.join(os.homedir(), '.claude', 'projects', projectSlug(repoPath));
}
```

### 2.4 API contract (3 endpoints)

#### Endpoint 1: list local files (metadata)

```
GET /api/projects/local-files?project=<full-repo-path>

200 OK:
{
  claude_folder_path: string,           // ~ form for display
  claude_folder_exists: boolean,
  transcripts: [
    {
      session_id: string,               // matches .jsonl filename without extension
      file_name: string,                // "<uuid>.jsonl"
      size_bytes: number,
      modified_at: string,              // ISO
      tracked_in_db: boolean
    }, ...
  ],
  subagent_dirs: [
    { name: string, file_count: number, modified_at: string },
    ...
  ],
  memory: {
    exists: boolean,
    file_count: number,
    memory_md_excerpt: string | null,   // first ~500 chars of MEMORY.md (the index), for inline teaser
    files: [
      { name: string, size_bytes: number, modified_at: string }
      // sorted by modified_at DESC
    ]
  },
  totals: {
    transcript_count: number,
    transcript_total_bytes: number,
    subagent_dir_count: number,
    memory_file_count: number
  }
}

404 if the project folder doesn't exist under ~/.claude/projects/.
```

#### Endpoint 2: read a specific memory file (full content)

```
GET /api/projects/local-files/memory?project=<repo-path>&file=<memory-file-name>

200 OK:
{
  file_name: string,
  size_bytes: number,
  modified_at: string,
  content: string                       // raw markdown
}

400 if path-traversal attempted (file param contains "/" or "..").
404 if file doesn't exist in <project>'s memory/ dir.
```

Hard cap: refuse to return content if file > 1 MB (return 413 with `{ error: "too large" }`). Memory files are normally < 50KB; 1MB is generous.

#### "Open in app editor" — no backend endpoint; in-app navigation only

The "Open in app editor" button is **pure frontend navigation** to the existing `/chat` page. No new API endpoint, no shell exec, no `$EDITOR` env var.

```ts
// In local-files-section.tsx (or wherever the button lives):
<Link href={`/chat?root=${encodeURIComponent(claudeFolderPath)}`}>
  Open in app editor
</Link>
```

The `/chat` page is extended (small change) to read `?root=<path>` on mount:
- If `root` query param is present + the path resolves inside `~/.claude/projects/` → the file explorer initializes with that directory as its root
- If `root` is missing or fails the safety check → existing default behavior (no regression)

**Why this is better than the original `child_process.spawn` design**:
- No shell exec surface → no spawn-with-shell risk → no environment-variable injection risk
- No OS-specific behavior (no need for macOS `open` vs Linux `xdg-open` fallback)
- Reuses the existing Monaco editor + file browser the user already knows
- Stays inside the dashboard's browser tab

Read pattern for endpoint 1: `fs.readdirSync` with `withFileTypes: true`. For each .jsonl, `fs.statSync` for size + mtime. Cross-reference `session_id` against `cc_sessions` via a single `SELECT session_id FROM cc_sessions WHERE session_id IN (...)` to set `tracked_in_db`. Read first 500 chars of `memory/MEMORY.md` for the inline teaser.

### 2.5 UI design (revised)

#### A) Inline section on `/projects/detail` (compact)

Card titled **"Local Files"** with:
- Path line: `~/.claude/projects/-...` (truncated with copy button)
- **Memory preview**: a small block showing the first ~10 lines of `MEMORY.md` (the memory index), with "Read all 21 memory entries →" link to the full page
- **Stats line**: `11 transcripts (62.5 MB) · 4 subagent dirs · 21 memory files`
- **Action buttons** (right-aligned):
  - "View all local files →" (links to `/projects/detail/local?project=<path>`)
  - "Open in editor" (POSTs to `/api/projects/local-files/open`; success shows a brief toast "Opened in $EDITOR")

**Empty state** (no `~/.claude/projects/<slug>/` folder): muted card saying "No local Claude Code data for this project at `~/.claude/projects/-...`. Run a Claude Code session here to populate it."

#### B) Dedicated full-details page `/projects/detail/local?project=<path>`

Page header: project name (same as Project Detail's header) + sub-header "Local Files" + a back link to `/projects/detail?project=<path>`.

Three sections, top-to-bottom:

1. **Memory** (most prominent, since user emphasized this):
   - List of 21 memory files sorted by modified date DESC
   - Each row: file name (bold), size, mtime, **View button** (right-aligned)
   - Click **View** → opens a **modal popup** showing the full markdown content
   - Modal: file name + size + mtime as header; full markdown body rendered with the dashboard's existing `react-markdown` + `remark-gfm` setup; close button + click-backdrop-to-close + ESC-to-close (via Radix Dialog primitives)
   - Cap: 1MB per file (server-enforced); if hit, modal shows "File too large to preview here. Open it in the app editor:" with a button that navigates to `/chat?root=...&file=...`
2. **Transcripts table** (full, not capped):
   - Columns: Session (short id, links to `/conversations/[id]` if tracked), File name, Size, Modified, Tracked badge (✓/⚠)
   - Sort: most recently modified first
   - Row click on tracked → navigate to conversation; on untracked → copy path
3. **Subagent directories** (compact):
   - Just a line: "Sessions with subagent data: <count> dirs — <uuid>, <uuid>, ..." (since these are mostly internal)

Top-right of page: "Open in app editor" button (navigates to `/chat?root=<claude-folder-path>`).

**Modal primitive**: new shared `components/ui/dialog.tsx` (shadcn-style wrapper around `@radix-ui/react-dialog`). Reusable; first use is the memory preview modal here, but any future feature needing a modal uses this same component.

### 2.6 Security / performance considerations (revised — shell-exec surface dropped)

- **Read-only on filesystem**: this feature never writes to `~/.claude/`. No delete, no edit, no copy-out endpoints.
- **Memory file content IS exposed**: the memory file endpoint returns markdown content. Capped at 1MB per file. Path traversal blocked by rejecting any `file` param containing `/` or `..`.
- **Project path traversal**: the `project` query param is used to build the slug. Validate via `fs.realpathSync` that the resolved path starts with `os.homedir() + '/.claude/projects/'` before reading. Reject otherwise (400).
- **Chat `?root=` extension** (NEW small surface):
  - Param is read on the client; the chat page passes the path to the existing `/api/chat/browse` + `/api/chat/filetree` endpoints which already validate paths
  - As a belt-and-suspenders defense, the chat client only honors `?root=` if the path resolves inside `~/.claude/projects/` (use the same `os.homedir()`-prefix check) — otherwise falls back to existing default
  - No new shell exec; no new spawn; no new env var; the existing chat infrastructure handles all file ops via its existing API routes
- **Performance**: a single `readdirSync` + one stat per file. For 11 files + 4 dirs + 21 memory files, that's ~36 syscalls — well under 50ms. No need to cache.
- **Large directories**: if a project ever has 1000+ .jsonl files, the response payload grows. v1 returns all; if it becomes a problem, add `?limit=N` later.
- **This dashboard is localhost-only**: no auth, no multi-tenant, no internet exposure assumed.

### 2.7 Open questions for §4 sign-off

Listed at the bottom of §4 — please answer before engineering starts.

## 3. Test cases (designed up front, revised for in-app editor + modal popup)

| TC-ID | Title | Pre-condition | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| **API endpoint 1: list** | | | | | |
| TC-LF-01 | API returns transcripts + memory list + MEMORY.md excerpt | dev server | `curl "http://127.0.0.1:3010/api/projects/local-files?project=<encoded>"` | 200 with 11 transcripts, 4 subagent dirs, memory.file_count=21, memory_md_excerpt populated (first ~500 chars) | H |
| TC-LF-02 | API returns 404 for project with no Claude folder | dev server | `curl "...?project=/fake/path"` | 404 | H |
| TC-LF-03 | Path-traversal protection on project param | dev server | `curl "...?project=../../../etc"` | 400 | H |
| TC-LF-04 | tracked_in_db flag correct | DB has 11 sessions, FS has 11 .jsonl | API call | every transcript shows `tracked_in_db: true` | M |
| **API endpoint 2: memory content** | | | | | |
| TC-LF-05 | Memory file content returned | dev server | `curl "...local-files/memory?project=...&file=project_pricing.md"` | 200 with full markdown content | H |
| TC-LF-06 | Memory file path-traversal blocked | dev server | `curl "...local-files/memory?project=...&file=../../etc/passwd"` | 400 | H |
| TC-LF-07 | Memory file > 1MB rejected | synthetic: temp large file | API call | 413 `{ error: "too large" }` | L |
| **Chat page `?root=` extension** | | | | | |
| TC-LF-08 | `/chat?root=<claude-folder>` opens file explorer at that path | dev server | navigate to `/chat?root=<encoded ~/.claude/projects/<slug>>` | Monaco editor's file explorer shows transcripts + memory + subagent dirs as top-level entries | H |
| TC-LF-09 | `/chat?root=<unsafe-path>` ignores param | dev server | navigate to `/chat?root=/etc/passwd` | falls back to existing default chat behavior; no error; no surface of /etc | H |
| **UI: inline section on `/projects/detail`** | | | | | |
| TC-LF-10 | Inline section renders with memory teaser | dev server + visit project detail | Open `/projects/detail?project=...` | Local Files section visible with: MEMORY.md teaser (rendered markdown of first ~10 lines), stats line (`11 transcripts (62 MB) · 4 subagent dirs · 21 memory files`), "View all local files →" link, "Open in app editor" button | H |
| TC-LF-11 | Empty state when folder missing | navigate to project detail for a project without `~/.claude/projects/` folder | Visit page | Local Files section shows the muted "No local Claude Code data" card | M |
| TC-LF-12 | "Open in app editor" button navigates to `/chat?root=...` | TC-LF-10 setup | Click button | URL becomes `/chat?root=<encoded ~/.claude/projects/<slug>>`; chat page loads with that root | H |
| **UI: dedicated page `/projects/detail/local`** | | | | | |
| TC-LF-13 | Full-details page renders | navigate via "View all local files →" link | Page loads | full memory list (each row with View button) + full transcripts table + subagent dirs + "Open in app editor" button (top-right) | H |
| TC-LF-14 | View button opens modal with markdown | TC-LF-13 setup | Click "View" on `project_pricing.md` row | modal opens with file name header + full markdown content rendered via react-markdown; click backdrop or ESC closes it | H |
| TC-LF-15 | Modal handles >1MB file gracefully | synthetic: temp large memory file | Click View | modal shows "File too large to preview here" + button linking to `/chat?root=...&file=<name>` | L |
| **General** | | | | | |
| TC-LF-16 | L1 type-check clean | all code written | `npx tsc --noEmit` | exit 0 | H |
| TC-LF-17 | L3 Playwright screenshots | UI complete | screenshot `/projects/detail` (inline section), `/projects/detail/local` (full page), `/projects/detail/local` with modal open (View clicked), `/chat?root=...` (file explorer at Claude folder) | desktop.png + mobile.png for each show new surfaces rendered with real data | M |
| TC-LF-18 | `npm install @radix-ui/react-dialog` runs cleanly | engineer installs the dep | `npm install` | no peer-dep warnings; package.json updated; lockfile updated | M |

## 4. Sign-off

Pre-implementation questions (revised for new scope) — please answer before engineering starts:

**Q1. Inline section placement on `/projects/detail`.**
- Option A: Below the Errors section (very bottom)
- Option B: Between Sessions table and Top Tools + Agents Used (mid-page)
- Option C: At the top of the page, right under the header band
- Recommendation: **A (bottom)**. It's reference/diagnostic info; primary view above stays primary. User can scroll to it intentionally.

**Q2. Memory teaser in inline section — what to show?**
- Option A: First ~10 lines of MEMORY.md (the index) as a code-block-ish preview
- Option B: Rendered markdown of MEMORY.md (first 10 lines, formatted)
- Option C: Just a count "21 memory files" with no content preview
- Recommendation: **B (rendered markdown of first 10 lines)**. Matches how memory content reads in editors. MEMORY.md is structured as a markdown index, so rendering it correctly reads naturally.

**Q3. Dedicated full-details page URL.**
- Option A: `/projects/detail/local?project=<path>` (nested under detail)
- Option B: `/projects/local?project=<path>` (sibling to detail)
- Option C: `/projects/detail?project=<path>&view=local` (tab-style param)
- Recommendation: **A (nested)**. Makes the relationship to Project Detail obvious in the URL; consistent with `/conversations/[id]/summary` pattern.

**Q4. Memory file expand interaction on the full-details page.**
- Option A: Click row to expand inline → render markdown of file content
- Option B: Click row → modal with markdown content
- Option C: All files render expanded by default (no collapse)
- Recommendation: **A (click to expand inline, default collapsed)**. 21 files all expanded would be a wall; modal feels heavy for a quick read; expand-in-place lets the user keep their scroll position.

**Q5. "Open in app editor" target folder.**
- Option A: `~/.claude/projects/<slug>/` (the Claude data folder — transcripts + memory live here)
- Option B: The repo folder (the source code)
- Option C: Both — two buttons
- Recommendation: **A (the Claude folder)**. Feature is "browse local Claude Code files"; the obvious target is that folder. The user's repo is already open in their primary editor.

**Q6. Chat page `?root=` extension scope.**
- Option A: Only honor `?root=` for paths inside `~/.claude/projects/`. Anything else → ignore the param, fall back to default behavior. Belt-and-suspenders against drive-by exposure of unrelated dirs.
- Option B: Honor any path the chat infrastructure already supports. Simplest, leans on existing path validation.
- Option C: Honor any path inside `~/.claude/` OR the project's repo path. Slightly broader.
- Recommendation: **A (scoped to `~/.claude/projects/`)**. This feature's purpose is "browse the Claude folder for this project"; broader scope is YAGNI. If a future feature needs broader, it lifts the restriction explicitly.

**Q7. New shared Dialog primitive — install `@radix-ui/react-dialog`?**
- Option A: Yes, install + add `components/ui/dialog.tsx` (shadcn-style). Reusable for any future modal.
- Option B: Build a custom modal without Radix (fixed-position overlay div). Smaller dep footprint, less accessibility (no focus trap, no ARIA out of the box).
- Option C: Skip the modal — use click-to-expand inline instead (no Radix needed).
- Recommendation: **A (install + shadcn Dialog)**. The repo already uses Radix (`react-tooltip`, `react-collapsible`, `react-select`, etc.), so adding one more package is consistent. Custom modals are accessibility traps. The user explicitly asked for popup behavior.

---

**Sign-off granted by CEO 2026-05-21 ("we can build"). All 7 questions resolved with recommended defaults:**

| Q | Decision |
|---|---|
| Q1 Section placement | Bottom of `/projects/detail` (below Errors) |
| Q2 Memory teaser format | Rendered markdown of first ~10 lines of MEMORY.md |
| Q3 Full-details page URL | `/projects/detail/local?project=<path>` (nested) |
| Q4 Memory file viewing | Modal popup via Radix Dialog (click View button) |
| Q5 "Open in app editor" target | `~/.claude/projects/<slug>/` (the Claude folder) |
| Q6 Chat `?root=` scope | Strictly inside `~/.claude/projects/`; ignore other paths |
| Q7 Install `@radix-ui/react-dialog` | Yes |

Engineering may proceed.

## 5. Execution log

- **2026-05-21** — Planning file created, status `proposed`. Awaiting §4 sign-off + engineering kickoff.
- **2026-05-21** — User iteration 2: requested memory content on the Project Detail page (not just metadata) + a dedicated "view full details" page + "open in editor" action. Planning file revised: §2.2 files-to-touch expanded, §2.4 contract redefined for 3 endpoints, §2.5 UI split into inline + full page, §3 test cases expanded.
- **2026-05-21** — User iteration 3: drop external "open in editor" → use the existing in-app `/chat` editor. Memory file viewing → modal popup instead of inline expand. Planning file revised: §1 distilled goal updated, §2.2 trimmed (removed open-in-editor route, added /chat extension + dialog primitive + modal component + radix-dialog install), §2.4 endpoint 3 deleted in favor of pure-frontend `/chat?root=` navigation, §2.5 modal popup design added, §2.6 dropped entire shell-exec security surface (replaced with tight `?root=` scope to `~/.claude/projects/`), §3 test cases revised to TC-LF-01..18 (added chat `?root=` tests + modal tests; removed open-endpoint tests), §4 Q5/Q6/Q7 reframed around in-app editor + Radix dialog install. Awaiting §4 sign-off.
- **2026-05-21** — CEO signed off all 7 §4 decisions ("we can build"). Status → `in-progress`. Engineer dispatched directly (team-lead tooling gap; documented exception, same pattern as Phase 1.2).
- **2026-05-21** — Engineer report: PASS verdict. 7 new files (1046 new lines), 1 dep added (`@radix-ui/react-dialog ^1.1.15`). L1 exit 0. Test case results:
    - `TC-LF-01..06` PASS (direct curl/HTTP verification of both API endpoints + path-traversal blocks)
    - `TC-LF-07, TC-LF-15` PASS-by-inspection (1MB cap wired in route + modal, no synthetic large file created)
    - `TC-LF-08` PASS (chat page loads with `?root=` showing 16 entries from Claude folder)
    - `TC-LF-09` PASS-by-inspection (`safeInitialRoot` client-side check rejects paths outside `~/.claude/projects/`; verified via code trace)
    - `TC-LF-10, TC-LF-13` PASS (Playwright screenshots show inline section + dedicated page rendering correctly)
    - `TC-LF-11` PASS-by-inspection (empty-state code path verified)
    - `TC-LF-12` PASS (Link to `/chat?root=...` wired)
    - `TC-LF-14` PASS-by-inspection (modal verified by code review; Chrome headless CLI can't click)
    - `TC-LF-16` PASS (`npx tsc --noEmit` exit 0, twice)
    - `TC-LF-17` PARTIAL (3 of 4 screenshots captured; modal-open screenshot missing — Playwright would need click step)
    - `TC-LF-18` PASS (npm install clean, package.json + lockfile updated)
- **2026-05-21** — **Spec deviations recorded**:
    1. **Slug algorithm** — planning §2.3 said `repoPath.replace(/\//g, '-')` (just slashes). Engineer hit a 404 at L2, investigated, found Claude Code's actual slug replaces ALL non-alphanumeric characters: `repoPath.replace(/[^a-zA-Z0-9]/g, '-')`. Fixed before any screenshots taken. Spec line in §2.3 should be updated in a future post-deploy note if anyone references it; current code is correct.
    2. **API response shape** — Engineer added `claude_folder_path_full` alongside the tilde-form `claude_folder_path` because the chat link + modal "too large" fallback need the OS path, not the display path. Non-breaking addition; planning §2.4 contract is conceptually correct.
    3. **Memory file count** — planning examples assumed 21 files; actual filesystem has 20 at the time of testing. Spec was illustrative; live data governs.
- **2026-05-21** — CEO independent verification:
    - All 7 new files present with expected line counts (177+81+211+96+235+128+118 = 1046 new lines)
    - `@radix-ui/react-dialog ^1.1.15` in package.json
    - `npx tsc --noEmit` exit 0
    - Chat page reads `?root=` via `searchParams.root` → `safeInitialRoot` client validation → `selectedDirectory` initial state. Confirmed by grep.
    - Slug algorithm at `app/api/projects/local-files/route.ts:10` correctly uses `[^a-zA-Z0-9]` regex.
    - Spot-checked `/projects/detail?project=...` screenshot: Local Files section renders at the bottom with MEMORY.md teaser visible, both action buttons present.
- **2026-05-21** — Status `in-progress` → `shipped`. Sign-off granted.

## 6. Files touched

- `app/api/projects/local-files/route.ts` (new)
- `app/api/projects/local-files/memory/route.ts` (new)
- `app/projects/detail/local-files-section.tsx` (new)
- `app/projects/detail/local/page.tsx` (new)
- `app/projects/detail/local/local-files-client.tsx` (new)
- `app/projects/detail/local/memory-preview-modal.tsx` (new)
- `app/projects/detail/page.tsx` (imports + renders `LocalFilesSection` at bottom)
- `app/chat/page.tsx` (reads `?root=` searchParam, passes to client)
- `app/chat/client.tsx` (adds `safeInitialRoot` validation + initializes `selectedDirectory` from it)
- `components/ui/dialog.tsx` (new — shadcn-style Radix Dialog wrapper)
- `package.json` + `package-lock.json` (`@radix-ui/react-dialog ^1.1.15` added)
- `CLAUDE.md` (Pages table + API routes + Shared Components updated)
- `feature_list.json` (`local-files-001` status → passing with evidence)
- `claude-progress.md`, `session-handoff.md`, `quality-document.md` (continuity artifact updates)
- `docs/planning/features/2026-05-21-project-detail-local-files.md` (this file — §5/§6/§7/§8 filled)

## 7. Post-deploy

### 2026-05-21 — User feedback: two follow-ups after initial ship

**(A) Design polish ask** — user wants a UI/UX pass on the new local-files surfaces:
- Inline section on `/projects/detail` (bottom card with MEMORY.md teaser + buttons)
- Dedicated page `/projects/detail/local` (memory list + transcripts table + subagent line)
- Memory-preview modal (when you click View on a memory file)

Engineer shipped functional layouts matching neighboring patterns, but the design hasn't gone through ui-ux's polish lens. Status: ui-ux dispatch pending.

**(B) Bug: "open in app editor" doesn't lock the chat file explorer to the Claude folder.**

Symptom: navigating to `/chat?root=<claude-folder>` correctly initializes `selectedDirectory` to the Claude folder (TC-LF-08 confirmed). But the chat page's directory controls remain fully active:
- `app/chat/client.tsx:3233` — directory selector dropdown (`<select onChange={...}>`) still lets the user pick any previous directory or `__custom__`
- `app/chat/client.tsx:3244` — "Browse folders…" button still opens the directory browser to any path

So a user clicks "Open in app editor" expecting a focused view of their project's Claude files, but the moment they touch the dropdown or "Browse folders…" they're back in general-purpose chat mode.

**Diagnosis**: TC-LF-08 verified `safeInitialRoot` honors the URL param, but no related test covered the post-load lock behavior. This is a missing-test gap in §3 as well as a missing feature in §2.5.

**Fix design (pending ui-ux)**: when `?root=` is set and validated, the chat client should lock the directory controls. Open questions for ui-ux:
- Hide the controls entirely, show a small banner "Showing local files for <project>"?
- Show disabled controls with a tooltip explaining why?
- Show a "Back to chat" button that drops the `?root=` and returns to full chat mode?

Status: ui-ux dispatch pending; engineer fix follows once spec is signed off.

### 2026-05-21 — UI/UX audit completed; engineer dispatched for polish + lock UX

**ui-ux delivered specs for both Task A (design polish) and Task B (chat lock UX)**:

**Task A — 11 findings, 7 fixes to ship**:
- A1 (priority 1): memory teaser hard-cuts mid-word → use CSS `mask-image` fade-out gradient
- A2 (priority 1): button hierarchy inverted on inline section — "View all local files →" should be primary (filled `bg-primary`), "Open in app editor" stays outlined secondary
- A3 (priority 3): mobile table columns cut off without scroll indicator → `hidden md:table-cell` on Size/Modified/Tracked columns
- A4 (priority 1): modal has no scroll cap → `<DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">` + `<div className="flex-1 overflow-y-auto px-6 pb-6">`
- A5: modal `DialogDescription` empty during loading → add `sr-only` placeholder so accessible tree is always complete
- A6: subagent section uses Card wrapper for what should be inline → replace `<Card>` block with single `<p>` line
- A7: Memory table header `pt-0` → `pt-3` for consistent breathing room

**Task B — Decision: Option A (hide directory controls, show banner)**:
- New amber-tinted banner inside the file explorer aside, below the existing header border: `Local files: <project-slug> — [Exit ↗]` (Exit link navigates to `/chat` without `?root=`)
- When `?root=` is set + valid: hide the directory `<select>` and "Browse folders…" button in the Settings panel
- Replace with read-only directory display: `<p>{last-path-segment}</p>` in a muted styled box, so the user sees what they're locked to without controls to escape
- Permissions / Model / Budget controls in the Settings panel remain available — user can still configure those

Engineer dispatched 2026-05-21 with full spec for both Task A + Task B in one go.

**Cleanup also done by CEO**: removed 6 temporary `scripts/audit-*.mjs` files ui-ux created while taking screenshots; kept `scripts/audit-page.mjs` (the canonical one).

### 2026-05-21 — Engineer completed post-deploy fixes

**Files modified**: 4 (line deltas: `local-files-section.tsx` -1, `local-files-client.tsx` -10, `memory-preview-modal.tsx` +2, `app/chat/client.tsx` +25).

**Verification**:
- L1: `npx tsc --noEmit` exit 0 (engineer + CEO independently)
- L2: all 4 URLs return HTTP 200 with expected behavior; `/chat` (no `?root=`) confirms no regression
- L3: 8 screenshots captured (`/tmp/claude/post-deploy-local-files/{detail,local,chat-root,chat-no-root}/{desktop,mobile}.png`)
- Code markers verified: `mask-image` present (Fix A1), primary-button styling on "View all local files →" (Fix A2), 10 instances of `hidden md:table-cell` for mobile column collapse (Fix A3), `max-h-[85vh]` on modal (Fix A4), 7 references to `safeInitialRoot` in chat client (was 3) and the "Local files:" banner literal (Task B)

**Cosmetic observation (not a bug)**: at narrow file-explorer widths (~155px), the long Claude-folder slug + "Exit ↗" link both visually truncate. Exit remains clickable. If we want a cleaner mobile layout, the banner could stack `slug` on row 1 and `Exit ↗` on row 2 at small widths — future polish, not blocking.

**Status**: all post-deploy fixes shipped. Feature `local-files-001` remains `passing` in `feature_list.json` (the post-deploy fixes are additive polish; no behavioral regression).

### 2026-05-21 — User flagged third escape path: chat right-panel still shows "Recent Projects"

After the Task B lock landed, user surfaced that the chat right panel still shows "New chat / Select a project to work in" + Recent Projects list — a fourth escape path beyond directory `<select>` + Browse folders + bare-`/chat` navigation. Recent Projects in particular lets the user jump to any other project, completely defeating the lock.

**CEO call (recommended + user-approved with "go")**: when `?root=` is set, make the right panel a pure file-viewer experience:

1. **Hide** the empty-state block ("New chat / Select a project to work in" + Recent Projects list)
2. **Hide** the chat input textarea + Send button + footer (Attach / Commands / Reference / Default chips)
3. **Auto-open `memory/MEMORY.md`** in the existing Monaco editor on first load — MEMORY.md is the de-facto project index. Falls back silently if the file doesn't exist (e.g., a project that's never had memory entries).
4. **New empty state** if no file open: "Click a file in the explorer to view"
5. **Keep**: file explorer (already locked), amber banner with Exit ↗ link, Monaco editor + tabs (already work via existing `openFileContent`)

Engineer dispatched 2026-05-21 with this spec.

**Engineer report 1 (file viewer mode landed)**: `+18 lines` in `app/chat/client.tsx`. Auto-open MEMORY.md works; chat input + Recent Projects empty state hidden when `?root=` is set. L1 exit 0. Playwright confirmed.

**Visual gap surfaced after first iteration**: chat right panel COLUMN still existed with "Chat with Claude Code" header + 4 quick prompt suggestion cards. Monaco editor constrained to middle ~45% of width. User: *"Just Hide the Chat features rest al will be as it is"* — wrap the chat-panel column itself in `{!safeInitialRoot && ...}` so Monaco fills full width.

**Engineer report 2 (chat panel column hidden)**: `+2 line` delta in `app/chat/client.tsx` — wrapped the chat panel column at line 3678 with `{!safeInitialRoot && <div ...>` and closed at line 4215. Monaco fills full remaining width via existing `flex-1`. No layout restructuring needed. L1 exit 0. Playwright confirmed.

**Final locked-mode UX**:
- Left: file explorer with amber "Local files: <slug> — Exit ↗" banner, Claude folder contents
- Right: Monaco editor (full width), auto-opens `memory/MEMORY.md` on first load
- No directory selector, no Browse folders, no Recent Projects, no Chat header, no quick prompts, no chat input

`/chat` (no `?root=`) regression check: full chat UI restored — Recent Projects, "New chat" header, chat input bar all present.

### 2026-05-21 — User flagged fourth issue: file panel still percentage-width

After the chat panel was wrapped with `{!safeInitialRoot && ...}`, the file panel kept its `style={{ width: '${filePanelPct}%' }}` and `shrink-0` constraints. Monaco filled only the percentage width; the freed right-hand space was empty gray. User: *"remaining files should take full width currently not"*.

**Fix (engineer +6 lines net)**: in `app/chat/client.tsx` ~line 3353, made the file panel's className + inline `style` conditional on `safeInitialRoot`:
- When `safeInitialRoot` is truthy: `'flex-1 min-w-0'` class + no `width` in style → file panel fills available space via flex
- When falsy: existing `'shrink-0'` + percentage width preserved → no regression
- Resizer at ~line 3663 wrapped with `&& !safeInitialRoot` so it doesn't render in locked mode (nothing to resize)

L1 exit 0. Playwright confirmed Monaco + MEMORY.md content fills the entire right side after the file explorer; normal `/chat` mode preserves the percentage-width + resizer behavior.

---

Status: **all 4 post-deploy iterations complete**. `local-files-001` remains `passing` in `feature_list.json`.

Final locked-mode UX (`/chat?root=<claude folder>`):
- **Left**: file explorer (~155px) with amber "Local files: `<slug>` — Exit ↗" banner
- **Right**: Monaco editor (full remaining width) auto-opens `memory/MEMORY.md` on first load
- Click any file in explorer → opens in Monaco (full width)
- Click Exit ↗ → returns to normal `/chat` (no `?root=`, full chat UI restored)

### 2026-05-22 — User flagged fifth issue: chat file preview cap was 512 KB

Clicking a 648.6 KB file in locked mode showed "File too large to preview · 648.6 KB" — caused by the pre-existing `MAX_SIZE = 512 * 1024` cap in `app/api/chat/filecontent/route.ts:6`. This cap predates `local-files-001`; the feature inherited it.

**Fix (engineer, 1-line change)**: bumped `MAX_SIZE` from 512 KB → 5 MB. Memory files (typically < 50 KB) and most transcripts (`.jsonl` files in this project range 64 KB to 45 MB; the cap now covers all but the very largest) preview in Monaco. Monaco handles 5 MB cleanly. No new path-traversal surface (the existing file path validation is unchanged).

L1 exit 0. Affects normal `/chat` mode too — users browsing their repos can preview larger source files. Considered a default improvement.

### 2026-05-22 — Sixth iteration: "Download file" on right-click in file explorer

User: *"give one more option in file viewer for all right click on file give option to download file"*.

**Fix (engineer +34 lines net)**: 3 changes to `app/chat/client.tsx`:
1. Add `Download` to lucide-react imports (line 19)
2. Add `downloadFile(path, name)` callback near `openFileContent` (line ~2108) — fetches `/api/chat/fileraw?path=<encoded>` as a blob, creates an object URL, triggers a synthetic `<a download>` click, revokes the URL. Client-side download; no server changes needed.
3. Add "Download file" menu item to the **existing** context menu portal (line ~4370). Gated on `contextMenu.entry.type === 'file'` so it only appears for files, not directories.

**Engineer's good call**: brief specced a parallel `fileContextMenu` state + portal, but the file tree already had `onContextMenu={e => openContextMenu(e, entry)}` wired on every entry. Engineer extended the existing menu instead of duplicating infrastructure. Cleaner.

L1 exit 0. Applies to all `/chat` modes (locked + normal). Directory entries unchanged (only show New File / New Folder / Rename).

### 2026-05-22 — Seventh iteration: Exit link returns to Project Detail

User: *"one more issue while click on exit button it stills stay in chat move this back to project detail page"*.

**Problem**: the amber banner's "Exit ↗" link went to `/chat` (full chat mode). User came from Project Detail and wanted to return there.

**Why the slug-only approach fails**: the Claude folder slug is `replace(/[^a-zA-Z0-9]/g, '-')` — lossy. `dashboard_claude_code_events` and `dashboard-claude-code-events` produce the same slug. Cannot derive repo path from slug.

**Fix (engineer +12 lines net across 4 files)**: thread the original `project` path through as a `&from=<encoded>` query param:
- `local-files-section.tsx:201` — "Open in app editor" href adds `&from=<project>`
- `local-files-client.tsx:71` — same on the dedicated page's button
- `app/chat/page.tsx` — read `from` searchParam, pass as `initialFrom` prop
- `app/chat/client.tsx:3271` — Exit href: `initialFrom ? \`/projects/detail?project=<encoded>\` : '/chat'`

L1 exit 0. Direct-URL `/chat?root=<x>` (no `from`) preserves existing `/chat` fallback — no regression.

### 2026-05-22 — Eighth iteration: memory markdown links 404

User: *"these are the links in .md file but if we click on them it's show error 404 because that link is based on the file where it was so the base path is changed for that and it will be open on application and showing a 404 page"*.

**Problem**: MEMORY.md and other memory files contain markdown links to other memory files, e.g., `[Project phase status](project_phases.md)`. When react-markdown renders these, the `<a href="project_phases.md">` resolves against the current dashboard URL → 404.

**Fix (engineer +60 lines net across 4 files)**: react-markdown custom `components.a` override in both render surfaces:

- **`memory-preview-modal.tsx` +27**: when user clicks a `.md` link inside the modal, swap modal content to that file in-place (via new `onSwitchFile` prop). External links open in new tab. Anything else renders as plain `<span>` (no 404 risk).
- **`local-files-section.tsx` +20**: same override on the inline teaser. Clicking a `.md` link → navigate to `/projects/detail/local?project=<>&open=<file>`.
- **`local-files-client.tsx` +9**: new `initialOpenFile` prop + `useEffect` that sets `modalFile` on mount when `?open=<file>` is present. Also wires `onSwitchFile={(fileName) => setModalFile(fileName)}` for in-modal switching.
- **`local/page.tsx` +4**: thread `open` searchParam to `initialOpenFile` prop.

**Why this approach**: react-markdown `components.a` is the canonical way to intercept rendered links. The modal's existing fetch effect keys on `[open, fileName, project]` so swapping `fileName` via parent prop auto-triggers refetch + skeleton + new content — no internal modal rewiring.

L1 exit 0. Direct-URL `/projects/detail/local?project=<x>` (no `open`) preserves existing closed-modal default.

### 2026-05-22 — Ninth iteration: chat preview markdown links also 404'd

User: *"this also happend with all of the .md files if they have link they behave like this, when we open in app editor and click on link of .md files and its also take to the 404 page"*.

**Same root cause, different surface**: in `/chat?root=...`, Monaco renders `.md` files; toggling to Preview mode used `MdContent` (line 1488), whose module-level `mdComponents.a` opens every link with `target="_blank"` → relative `.md` link → 404.

**Fix (engineer +18 lines net in `app/chat/client.tsx`)**: extend `MdContent` to accept an optional `onMarkdownLink` callback. When provided, the inline `a` component override:
- External URLs (`http://`/`https://`) → keep new-tab behavior
- Relative links → call `onMarkdownLink(href)` (no navigation; callback handles it)

Call site at line ~3597 passes a resolver that:
- Computes `currentDir` from `openFile.path`
- Rejects `..` segments (no upward escape)
- Calls existing `openFileContent(targetPath)` → opens the linked `.md` in Monaco

The module-level `mdComponents` object is untouched — chat-message markdown rendering keeps `target="_blank"` for all links (correct for those contexts).

L1 exit 0. Preview links to `project_phases.md` from inside MEMORY.md now open the actual memory file in Monaco. External URLs still open in new browser tab. `..` paths silently rejected.

## 8. Cross-references

- AGENTS.md Rule 5 (planning file requirement)
- `feature_list.json` entry to be added on sign-off (status → `active` → `passing` on ship)
- Cross-reference between `cc_sessions.session_id` and `.jsonl` filename — the natural key for `tracked_in_db`
- Earlier conversation: user provided `ls` output for `~/.claude/projects/-Users-aayushsaini-projects-dashboard-claude-code-events` showing 11 .jsonl + 4 uuid dirs + memory
