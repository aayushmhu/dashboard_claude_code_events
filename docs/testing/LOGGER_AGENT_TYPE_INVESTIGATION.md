# Logger Investigation: SubagentStop agent_type Empty Values

**Date:** 2026-05-17  
**Status:** Investigation complete. No code changes made.

---

## Current State

- Total SubagentStop events in live DB: 303
- `agent_type` populated: 137 (45%)
- `agent_type` empty string: 166 (55%)

---

## Root Cause

**The logger is not at fault.** `scripts/log-to-db.py` line 439:

```python
row["agent"] = data.get("agent_type") or data.get("agent_name") or "subagent"
```

The full `data` dict is also stored as `raw_payload`. So when `raw_payload.agent_type` is empty, that means Claude Code itself sent an empty string in the `SubagentStop` hook payload — the logger faithfully recorded what it received.

**The upstream cause is Claude Code's hook system.** The `agent_type` field in the `SubagentStop` hook payload is only populated when the subagent was declared with an explicit `.claude/agents/<name>.md` file. When a subagent is spawned without a named agent definition (i.e., called with an inline prompt via the `Agent` tool without specifying a typed agent), Claude Code sends `agent_type: ""` in the SubagentStop hook event.

Evidence: the 137 populated events all have named agent types (`general-purpose`, `Explore`, `tester`, `frontend-developer`, `team-lead`, etc.). The 166 empty events all have `agent: "subagent"` in the DB — consistent with unnamed dispatch.

Time range overlap confirms this is not a version issue: both empty and populated events occur from 2026-05-07 through 2026-05-16. The gap closed as more named agents were adopted.

---

## Backfill Feasibility

**135 of 166 empty events are backfillable** from the matching `PreToolUse` Agent event in the same session.

The `PreToolUse` event for `tool_name='Agent'` always has `tool_input.subagent_type` populated (that's what the dispatch card in the UI reads). By joining on `session_id` + nearest prior PreToolUse Agent timestamp, we can recover the name for 135/166 (81%) of the unknowns.

The remaining 31 are from sessions that have no `PreToolUse Agent` event recorded at all (2 distinct sessions, oldest from 2026-05-08). These sessions predate consistent logging and cannot be recovered.

**Backfill SQL (one-off, run manually):**

```sql
UPDATE cc_events AS ss
SET raw_payload = json_set(
    ss.raw_payload,
    '$.agent_type',
    (
        SELECT json_extract(pre.tool_input, '$.subagent_type')
        FROM cc_events pre
        WHERE pre.session_id = ss.session_id
          AND pre.event_type = 'PreToolUse'
          AND pre.tool_name = 'Agent'
          AND pre.timestamp <= ss.timestamp
        ORDER BY pre.timestamp DESC
        LIMIT 1
    )
),
agent = COALESCE(
    (
        SELECT json_extract(pre.tool_input, '$.subagent_type')
        FROM cc_events pre
        WHERE pre.session_id = ss.session_id
          AND pre.event_type = 'PreToolUse'
          AND pre.tool_name = 'Agent'
          AND pre.timestamp <= ss.timestamp
        ORDER BY pre.timestamp DESC
        LIMIT 1
    ),
    ss.agent
)
WHERE ss.event_type = 'SubagentStop'
  AND COALESCE(NULLIF(json_extract(ss.raw_payload, '$.agent_type'), ''), '') = '';
```

This would repair 135 rows. The 31 unrecoverable rows stay as "subagent".

---

## Logger Patch

No logger patch is needed or recommended. The logger correctly records what Claude Code sends. The fix, if any, would need to be in Claude Code itself (populating `agent_type` for unnamed agents). That is not under this project's control.

The display-layer fix (COALESCE fallback) already ships the right behavior for both populated and recoverable-empty cases.

---

## CEO Decision Required

1. Run the backfill SQL above to repair 135 historical rows (one-time, irreversible update to the live DB).
2. Leave as-is — 45% populated is acceptable given the display fallback already handles "subagent" gracefully.
