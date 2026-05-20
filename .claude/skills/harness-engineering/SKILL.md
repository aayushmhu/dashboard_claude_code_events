---
name: harness-engineering
description: Methodology for building closed-loop AI agent harnesses. Distills the [learn-harness-engineering](https://walkinglabs.github.io/learn-harness-engineering/) curriculum (12 lectures + templates) into the rules and artifacts this repo uses. Invoke when starting any session, making decisions about agent workflow, deciding what "done" means, or auditing whether the repo is in a clean state.
---

# Harness Engineering Skill

> **Source**: <https://walkinglabs.github.io/learn-harness-engineering/en/>
>
> **Custodian in this repo**: the `ceo` agent. CEO knows this skill deeply and enforces it across the team.

## What this skill teaches

The methodology argues that AI coding agents fail not because the model is dumb, but because the **runtime harness** around the model is missing. The fix isn't a smarter model — it's:

1. The **repository becomes the system of record** (not chat memory)
2. A small set of **machine-readable artifacts** track state across sessions
3. A small set of **non-negotiable rules** govern how agents work
4. **Three-layer verification** prevents "declaring victory too early"

A session is closed-loop when (a) it picks up work without manual context-loading, (b) it leaves the repo in a state where the next session can do the same.

## When to invoke this skill

- **At the start of every session** — to confirm the 6-step startup workflow
- **Before declaring a feature done** — to confirm 3-layer verification ran
- **At end of every session** — to run the clean-state checklist
- **When tempted to "also fix X" while working on Y** — to re-anchor on scope discipline
- **When updating CLAUDE.md or any agent prompt** — to confirm the file-size + structure rules

## Core principles (the 5 disciplines)

### 1. Commit discipline (lecture-03)

- **Doc updates ride with code commits.** When code change makes `feature_list.json`, `claude-progress.md`, `quality-document.md`, or `CLAUDE.md` stale, the doc update goes in the **same** commit.
- **All-or-nothing commits.** If verification fails midway, `git stash`; don't commit inconsistent intermediate state.
- **Stale docs are more dangerous than no docs** — they actively mislead the next session.

### 2. Scope discipline (lecture-07)

- **Work on one feature at a time.** Pick the highest-priority `not_started` or already-`active` feature from `feature_list.json` at session start.
- **AT MOST ONE feature** may be `active` at any moment across the whole repo.
- **No drive-by refactors.** Don't "also clean up X" while implementing Y. Surface unrelated work as a new entry in `feature_list.json`.
- **Valid feature states**: `not_started`, `active`, `blocked`, `passing`. Do not invent others.
- **Verified completion rate matters more than lines of code.** Block activating new features if completion rate < 100%.

### 3. Completion discipline (lecture-09)

**Three-layer verification, no skipping ahead:**

| Layer | What it proves | Concrete check for this repo |
|---|---|---|
| **L1 Static** | Syntax + types | `npx tsc --noEmit` exit 0; `npm run lint` if lint-sensitive files touched |
| **L2 Runtime** | App starts, pages render, APIs return data | `PORT=3010 npm run dev` starts; changed pages render; changed API routes return real JSON |
| **L3 Integration** | End-to-end behavior with real data | Live-DB SQL dry-run (for insight rules); Playwright desktop+mobile screenshot (for visual changes); curl + expected JSON (for API changes) |

**Cannot advance to L2 if L1 fails. Cannot advance to L3 if L2 fails.**

What is NOT proof of completion:

- Unit tests passing alone
- Type-check alone
- "Code appears correct" / agent self-reported confidence
- Mocked-only success without real environment
- Refactoring before verification

### 4. Session discipline (lecture-06, lecture-12)

**At session start:**

1. Confirm working directory with `pwd`
2. Read [`claude-progress.md`](../../../claude-progress.md) for latest verified state and next step
3. Read [`feature_list.json`](../../../feature_list.json); pick the highest-priority unfinished feature
4. Review recent commits: `git log --oneline -5`
5. Run the standard startup path: `npm install && npm run init && PORT=3010 npm run dev`
6. Run L1 verification: `npx tsc --noEmit`. **If L1 is failing on baseline, fix that before starting any new feature work** — do not stack on a broken baseline.

**At session end:**

1. Update [`claude-progress.md`](../../../claude-progress.md) — new session entry, current verified state
2. Update [`feature_list.json`](../../../feature_list.json) — status changes, `evidence` array filled in
3. Update [`session-handoff.md`](../../../session-handoff.md) — Verified Now, Changed, Broken-or-Unverified, Next Best Step, Commands
4. Run [`clean-state-checklist.md`](../../../clean-state-checklist.md) — six items must pass
5. Commit only when user explicitly confirms (AGENTS.md Rule #1)

### 5. File discipline (lecture-04)

- **CLAUDE.md ≤ 200 lines.** ≤ 15 non-negotiable rules. Move topic detail into separate `docs/` files (50–150 lines each).
- **Never use the middle of long files.** Critical content goes at the top or bottom. The middle gets ignored ("Lost in the Middle" effect).
- **One-way links only.** CLAUDE.md points outward (into `docs/`, `.claude/agents/`, etc.); referenced files don't duplicate content back.
- **Single source of truth per topic.** If a rule is in CLAUDE.md, it isn't also restated in every agent prompt.
- **Every rule should have implied source + applicability + expiry.** Treat instruction bloat like technical debt — delete outdated entries.

## Required harness artifacts

All **live** artifacts at project root (predictable agent discovery). Reference docs in `docs/`.

### Live (updated every session)

| Artifact | Path | Updated when |
|---|---|---|
| `feature_list.json` | root | At start of session (pick `active`) and end of session (status + evidence) |
| `claude-progress.md` | root | At end of every session (append new session entry; update Current Verified State) |
| `session-handoff.md` | root | At end of every session (full rewrite — it's a snapshot) |
| `quality-document.md` | root | After each significant session, or before starting a new phase of work |

### Reference (mostly static templates)

| Artifact | Path | Purpose |
|---|---|---|
| `clean-state-checklist.md` | root | Exit checklist; run it at end of session |
| `evaluator-rubric.md` | root | Post-implementation review rubric (Accept / Revise / Block) |
| `CLAUDE.md` | root | Root agent instruction file — index + non-negotiable rules |
| `.claude/agents/*.md` | `.claude/agents/` | Per-role agent prompts |
| `.claude/skills/*/SKILL.md` | `.claude/skills/` | Methodology skills like this one |

### Repo-specific reference

| Artifact | Path |
|---|---|
| Insight rule specs | `docs/product/insight-specs/` |
| Audit results | `docs/testing/_AUDIT_*.md` |
| Investigations | `docs/testing/*INVESTIGATION*.md` |
| **Feature planning files** (one per feature) | `docs/planning/features/<YYYY-MM-DD>-<slug>.md` (template: `_TEMPLATE.md`) |
| Other forward-looking plans | `docs/planning/` (loose) |
| Client requirements | `docs/requirement/` |

**Feature planning files (project-specific extension to the methodology):** Every new feature gets a dedicated planning file before code is written. It carries the verbatim requirement, the plan, test cases designed up-front, an execution log, and post-deploy issues. Statuses: `proposed` → `in-progress` → `shipped` (terminal). **Before any work, grep this directory first** — if a related file exists, append to it rather than starting fresh. See AGENTS.md Rule 5.

## How CEO uses this skill

CEO is the **custodian** of the methodology in this repo. CEO's job, every session:

1. At session start, mentally invoke this skill — confirm the 6-step startup workflow is followed.
2. When dispatching work to team-lead, name the L1/L2/L3 verification expectations explicitly. Engineer doesn't get to skip layers.
3. When a feature is reported "done", verify the `evidence` array in `feature_list.json` is populated with real artifacts before accepting. Empty evidence = not done.
4. At session end, confirm `claude-progress.md` + `feature_list.json` + `session-handoff.md` are updated as part of the same commit as code. Block commit if they aren't.
5. When CLAUDE.md or an agent prompt grows past comfortable, propose moving detail into `docs/` and shrinking the root file. CEO owns this hygiene.
6. Push back on scope creep using the "AT MOST ONE active feature" rule.

## Source material

- **Methodology landing**: <https://walkinglabs.github.io/learn-harness-engineering/en/>
- **12 lectures**: `/lectures/lecture-01-...` through `/lectures/lecture-12-...`
- **Templates**: <https://walkinglabs.github.io/learn-harness-engineering/en/resources/templates/>
- **harness-creator skill (GitHub)**: <https://github.com/walkinglabs/learn-harness-engineering/tree/main/skills/harness-creator>

This skill is a distillation. When the curriculum disagrees with this file, the curriculum wins — update this file to match.
