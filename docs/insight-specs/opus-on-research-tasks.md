# Rule: opus-on-research-tasks

## Entity counted
**Opus sessions** in the last 30 days that performed ≥ N tool calls but ZERO `Edit`, `Write`, or `NotebookEdit` calls — i.e., pure read/search/research patterns. Opus excels at multi-step reasoning + code generation; pure file-browsing doesn't need Opus rates.

## Trigger conditions
- ≥ `opus_research_min_sessions` (default 2) such sessions
- Per-session: ≥ `opus_research_min_tools` (default 10) tool calls
- Per-session: 0 file-mutating tool calls (Edit / Write / NotebookEdit)

## Edge cases addressed
- **Distinct from opus-trivial-tools:** That rule counts Opus *turns* in trivial-tool sessions. This rule counts Opus *sessions* where the work pattern is research-only.
- **Per-model pricing:** Saving estimate uses (Opus rates − Sonnet rates) on the session's cost.

## What we claim
*"X Opus sessions did research-only work (no Edit/Write/NotebookEdit). Sonnet would have handled these at 5× lower cost."*
