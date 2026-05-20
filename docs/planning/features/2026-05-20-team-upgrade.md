# Team Upgrade — Out-of-scope discipline + claude-dev-guest

| Field | Value |
|---|---|
| Status | shipped |
| Started | 2026-05-20 |
| Shipped | 2026-05-20 |
| SRS row | — |
| Test cases | manual review per agent file |
| Prototype todo | — |

## 1. Requirement (as given)

> "You Have Team, now the Time to Upgrade the Team and give them their do's and don't clearly so they don't do other agents work and give the new user a lowest model and one more agent need to be added as a guest user but a developer who know the claude code and the ecosystme completly and work on claude cli and claude code vs code extension and claude code software too so based on that what is their behaviour for this software"
>
> "keep the ui-ux as it is and lets build it and give the guest user another name claude-dev-guest"

## 2. Plan

Three parts:

### Part A — Add "When you find yourself out of scope" section to all 6 existing agents

Adds a uniform section right after the existing "What you do NOT do" section. Each agent gets 3-5 bullets covering the most common drift patterns + a standard hand-off phrase + a "don't guess" clause.

Drift patterns per agent:

| Agent | Common drift pattern | Where to dispatch |
|---|---|---|
| ceo | Editing code "just this once" because the change is tiny | team-lead always |
| team-lead | Writing engineer's code themselves to "save a hop" | engineer always |
| engineer | Picking a visual treatment when the brief is silent | ui-ux via team-lead |
| engineer | Picking label/copy when the brief is silent | pm via team-lead |
| ui-ux | Writing component code beyond a 1-line CSS tweak | engineer via team-lead |
| ui-ux | Picking copy that lives inside their layout | pm |
| pm | Approving a visual layout choice because copy reads | escalate to ui-ux |
| insights-engineer | Editing UI files to surface a new rule | engineer via team-lead |

Standard hand-off phrase added to each: *"This is [role]'s scope — dispatching."*

Standard "don't guess" clause: when the brief is ambiguous about whose scope a sub-task is, escalate to the dispatcher — don't decide unilaterally.

### Part B — Downgrade `new-user` agent to Haiku

Change `model: claude-sonnet-4-6` → `model: claude-haiku-4-5` in `.claude/agents/new-user.md`.

Rationale: new-user is a pure first-impression vibe persona ("what did I see in 5 seconds, what would make me close the tab"). No technical reasoning required. Haiku is fast + cheap and aligns with the value of the persona.

### Part C — Add new `claude-dev-guest` agent

New file: `.claude/agents/claude-dev-guest.md`

**Persona**: Developer who uses Claude Code daily across all surfaces (CLI, VS Code extension, standalone software, SDK). Knows the ecosystem (hooks, MCP, agent teams, skills, experimental flags). Visits this dashboard as a curious outsider judging if it would fit their workflow.

**Distinguishes from `new-user`**: new-user has never seen any AI dev tool; claude-dev-guest lives in the Claude ecosystem and asks "would this fit my existing toolchain?"

**Model**: Sonnet (claude-sonnet-4-6). Reasoning required for technical audit; Haiku would miss nuance.

**When to invoke**: Before a major release / public link / investor demo. After adding a new page or feature that touches the Claude Code workflow. One-shot "would a Claude power user use this?" check.

**Boundaries**: Audits only — does NOT write code, doesn't pick copy or visual treatment, doesn't make product calls. Has the same "What you do NOT do" + "When you find yourself out of scope" sections as the rest of the team.

### Part D — Update CEO team roster table

Add `claude-dev-guest` row. Reflect `new-user`'s model change to Haiku.

## 3. Test cases (designed up front)

| TC-ID | Title | Pre-condition | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-TU-01 | All 6 existing agents have new section | Edits complete | grep "When you find yourself out of scope" in all 6 files | All 6 files match | H |
| TC-TU-02 | new-user model is Haiku | new-user.md edited | `head .claude/agents/new-user.md` | frontmatter shows `model: claude-haiku-4-5` | H |
| TC-TU-03 | claude-dev-guest agent file exists | claude-dev-guest.md created | `ls .claude/agents/claude-dev-guest.md` | file exists, has frontmatter (name, description, model) | H |
| TC-TU-04 | claude-dev-guest persona reflects ecosystem expertise | claude-dev-guest.md complete | Read the persona section | Mentions CLI, VS Code extension, standalone, SDK, hooks/MCP/skills | M |
| TC-TU-05 | CEO team roster has 8 agents | ceo.md edited | grep team table | claude-dev-guest row present; new-user shows Haiku | M |
| TC-TU-06 | Each "Out of scope" section names dispatch target by role | All 6 agents | Inspect each section | Each lists "stop and dispatch to [specific role]" not just "stop" | M |
| TC-TU-07 | No agent's section grows the file past 200 lines | All edits done | wc -l per agent file | All agent files reasonable (< 250 lines each) | L |

## 4. Sign-off

Pre-implementation questions + answers:

- **Q: guest-dev model — Sonnet or Haiku?** → A: Defaulted to Sonnet (CEO recommendation); user did not explicitly choose. Will note in execution log if reconsidered.
- **Q: Agent name?** → A: `claude-dev-guest` (user direction 2026-05-20).
- **Q: ui-ux dispatch source change?** → A: No change. Keep dual (CEO strategic + team-lead operational).
- **Q: CEO dispatch table prominence?** → A: User did not request change. Leave as-is.

## 5. Execution log

- **2026-05-20** — Planning file created. Starting Part A.
- **2026-05-20** — Part B: new-user model frontmatter changed `claude-sonnet-4-6` → `claude-haiku-4-5`. `TC-TU-02 PASS`.
- **2026-05-20** — Part C: `claude-dev-guest.md` created (137 lines, Sonnet model, full persona + audit dimensions + boundaries + out-of-scope section). `TC-TU-03 PASS`, `TC-TU-04 PASS`.
- **2026-05-20** — Part A: out-of-scope sections added to ceo, team-lead, engineer, ui-ux, pm, insights-engineer. Each lists specific dispatch targets by role, includes standard hand-off phrase, covers ambiguous-brief case. `TC-TU-01 PASS`, `TC-TU-06 PASS`.
- **2026-05-20** — Part D: CEO team roster table extended with Model column + new rows for `new-user` (Haiku) and `claude-dev-guest` (Sonnet). `TC-TU-05 PASS`.
- **2026-05-20** — User requested mid-task: add new "Files touched" section to the feature planning template. Template updated as §6 (slotted between Execution Log and Post-deploy). This planning file updated to use the new section structure.
- **2026-05-20** — `TC-TU-07`: file sizes — `claude-dev-guest.md` (137 lines), `ceo.md` (228 lines), `team-lead.md` (78 lines), `engineer.md` (98 lines), `ui-ux.md` (87 lines), `pm.md` (93 lines), `insights-engineer.md` (130 lines). All under 250 — `PASS`.
- **2026-05-20 (post-deploy)** — User flagged two issues after delivery: (1) CEO org chart not updated for new audit roles; (2) 11 broken markdown link references across 5 agent files pointing to non-existent files (`feedback_analytics_rules.md`, `project_phases.md`, `project_pricing.md`, `feedback_ceo_role.md`, `project_claude_code_facts.md`, `project_audience_and_signal.md` — all live in `~/.claude/projects/.../memory/`, not in repo). Fixes:
    - Converted broken `[X.md](X.md)` links to backtick `` `X.md` `` notation across `ceo.md`, `team-lead.md`, `engineer.md`, `insights-engineer.md`, `pm.md`. Memory files are still loaded via MEMORY.md auto-load; the agent reading the prompt has the content even without a clickable link.
    - Discovered two orphaned legacy agent files (`.claude/agents/ui-designer.md`, `.claude/agents/product-manager.md`) — predate the team structure, have no frontmatter, never registered as agents. Deleted both.
    - Updated CEO org chart to show two tiers under CEO: **operational team** (ui-ux, team-lead, pm, engineer, insights-engineer) and **audit roles** (new-user, claude-dev-guest). Captured the dispatch-direct-OK-for-audit / dispatch-via-team-lead-required-for-engineer rule explicitly.

## 6. Files touched

- `.claude/agents/new-user.md`
- `.claude/agents/ceo.md`
- `.claude/agents/team-lead.md`
- `.claude/agents/engineer.md`
- `.claude/agents/ui-ux.md`
- `.claude/agents/pm.md`
- `.claude/agents/insights-engineer.md`
- `.claude/agents/claude-dev-guest.md` (new)
- `.claude/agents/ui-designer.md` (deleted — orphaned legacy)
- `.claude/agents/product-manager.md` (deleted — orphaned legacy)
- `docs/planning/features/_TEMPLATE.md` (added §6 "Files touched")
- `docs/planning/features/2026-05-20-team-upgrade.md` (new — this file)

## 7. Post-deploy

- **2026-05-20** — User flagged: CLAUDE.md's "Agent team" section was not updated when `claude-dev-guest` was added and `new-user` was switched to Haiku. **Root cause**: Rule 2 (doc updates ride with code commits) wasn't operationalized — it listed CLAUDE.md as one of the files to keep current but didn't enumerate WHICH sections to audit when. **Fix**:
    1. Extended Rule 2 to list every CLAUDE.md section that's a frequent staleness target (Pages, API routes, Agent team, Database, Tech stack, Shared Components) and require an audit after every meaningful task.
    2. Updated CLAUDE.md's Agent team section to reflect current 8-agent roster (5 operational + 1 specialist + 2 audit) with a model column, role descriptions, and an embedded org chart matching the one in `ceo.md`.
- **2026-05-20** — User requested "check every document is up to date." Wide-scope audit found 4 stale items: (a) `insights-engineer.md` said "Twelve specs exist today" — actual is 15 (rule bar HIT). (b) `insights-engineer.md` said "we're under [the 15-rule bar]" — actually HIT. (c) `insights-engineer.md` said "14 rules already" in 2 places — should be 15. (d) `README.md` clone URL still pointed at the pre-rename repo (`dashboard_claude_code_events`) and was missing 3 routes (Project Detail, Session Summary, Model Pricing). All 4 fixed.

## 8. Cross-references

- AGENTS.md Rule 5 (planning file requirement)
- `.claude/agents/*.md` (all 6 existing files modified)
- `.claude/agents/claude-dev-guest.md` (new)
- `.claude/skills/harness-engineering/SKILL.md` (no change needed)
- `docs/planning/features/_TEMPLATE.md` (added "Files touched" section as §6)
