import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// Per-model cost expression. Sonnet is the default (Claude Code's default model);
// Opus is ~5× Sonnet and Haiku is ~4× cheaper. Applying a single hardcoded rate to
// mixed-model data understates Opus cost and overstates Haiku cost.
const COST_SQL = `(
  CASE
    WHEN e.model LIKE '%opus%' THEN
      COALESCE(e.input_tokens, 0)          * 15.0  / 1000000 +
      COALESCE(e.output_tokens, 0)         * 75.0  / 1000000 +
      COALESCE(e.cache_creation_tokens, 0) * 18.75 / 1000000 +
      COALESCE(e.cache_read_tokens, 0)     * 1.50  / 1000000
    WHEN e.model LIKE '%haiku%' THEN
      COALESCE(e.input_tokens, 0)          * 0.80  / 1000000 +
      COALESCE(e.output_tokens, 0)         * 4.0   / 1000000 +
      COALESCE(e.cache_creation_tokens, 0) * 1.0   / 1000000 +
      COALESCE(e.cache_read_tokens, 0)     * 0.08  / 1000000
    ELSE
      COALESCE(e.input_tokens, 0)          * 3.0   / 1000000 +
      COALESCE(e.output_tokens, 0)         * 15.0  / 1000000 +
      COALESCE(e.cache_creation_tokens, 0) * 3.75  / 1000000 +
      COALESCE(e.cache_read_tokens, 0)     * 0.30  / 1000000
  END
)`;

// Haiku alternative cost (used only as the "what if you ran this on Haiku" baseline).
const HAIKU_COST_SQL = `(
  COALESCE(e.input_tokens, 0)          * 0.80   / 1000000 +
  COALESCE(e.output_tokens, 0)         * 4.0    / 1000000 +
  COALESCE(e.cache_creation_tokens, 0) * 1.0    / 1000000 +
  COALESCE(e.cache_read_tokens, 0)     * 0.08   / 1000000
)`;

const TRIVIAL_TOOLS = `('Bash','Read','Glob','LS','Grep','WebSearch','WebFetch')`;

const DEFAULTS = {
  opus_min_turns: 5,
  opus_min_cost: 0.10,
  agent_min_calls: 5,
  agent_min_avg_input: 50000,
  agent_max_cache_ratio: 0.30,
  edit_retries_min_sessions: 2,
  edit_retries_min_per_session: 3,
};

const CACHE_HIT_ASSUMPTION = 0.70;

async function loadThresholds() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT key, value FROM settings WHERE key LIKE 'insight_%'`
  );
  const out = { ...DEFAULTS };
  for (const r of rows) {
    const k = (r.key as string).replace(/^insight_/, '') as keyof typeof DEFAULTS;
    if (k in out) {
      const n = parseFloat(r.value);
      if (!isNaN(n)) out[k] = n;
    }
  }
  return out;
}

export async function GET() {
  try {
    const t = await loadThresholds();
    const insights: Array<{
      id: string;
      title: string;
      body: string;
      saving?: string;
      savingSubtext?: string;
      type: 'cost' | 'cache' | 'pattern';
      details: {
        metrics: { label: string; value: string }[];
        thresholds: { label: string; value: string }[];
      };
    }> = [];

    // ── Rule 1: Opus turns that only ran trivial tools ───────────────────────
    // Turn-level (not session-level): Claude Code defaults to Sonnet; users may
    // flip to Opus for a single turn. Counts Opus Stop/SubagentStop events from
    // sessions whose tool usage was entirely lookup/shell tools.
    const [opusRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*)               AS turn_count,
        SUM(${COST_SQL})       AS actual_cost,
        SUM(${HAIKU_COST_SQL}) AS haiku_cost
      FROM cc_events e
      WHERE e.event_type IN ('Stop', 'SubagentStop')
        AND e.model LIKE '%opus%'
        AND e.timestamp >= datetime('now', '-30 days')
        AND e.input_tokens > 0
        AND e.session_id IN (
          SELECT session_id FROM cc_events
          WHERE event_type = 'PostToolUse'
            AND timestamp >= datetime('now', '-30 days')
          GROUP BY session_id
          HAVING SUM(CASE WHEN tool_name NOT IN ${TRIVIAL_TOOLS} THEN 1 ELSE 0 END) = 0
            AND COUNT(*) > 0
        )
    `);
    const [opusTotalRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total_opus_turns
      FROM cc_events e
      WHERE e.event_type IN ('Stop', 'SubagentStop')
        AND e.model LIKE '%opus%'
        AND e.timestamp >= datetime('now', '-30 days')
        AND e.input_tokens > 0
    `);
    const opus = opusRows[0];
    const totalOpusTurns = Number(opusTotalRows[0]?.total_opus_turns ?? 0);
    if (opus && Number(opus.turn_count) >= t.opus_min_turns && Number(opus.actual_cost) > t.opus_min_cost) {
      const saved = Number(opus.actual_cost) - Number(opus.haiku_cost);
      const turns = Number(opus.turn_count);
      const matchPct = totalOpusTurns > 0 ? Math.round(turns / totalOpusTurns * 100) : 0;
      insights.push({
        id: 'opus-trivial-tools',
        type: 'cost',
        title: `${turns} Opus turns used only trivial tools (last 30 days)`,
        body: `These turns ran Bash/Read/Grep/etc and didn't need Opus reasoning. Haiku handles lookup-style work at a fraction of the cost.`,
        saving: `~$${saved.toFixed(2)} avoidable spend`,
        savingSubtext: `at Haiku rates · ${turns} of ${totalOpusTurns} Opus turns affected`,
        details: {
          metrics: [
            { label: 'Matching Opus turns', value: `${turns} of ${totalOpusTurns} (${matchPct}%)` },
            { label: 'Actual cost (Opus rates)',  value: `$${Number(opus.actual_cost).toFixed(2)}` },
            { label: 'Hypothetical Haiku cost',   value: `$${Number(opus.haiku_cost).toFixed(2)}` },
            { label: 'Window',                    value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min matching turns', value: `≥ ${t.opus_min_turns}` },
            { label: 'Min actual cost',    value: `> $${t.opus_min_cost.toFixed(2)}` },
          ],
        },
      });
    }

    // ── Rule 2: Subagent calls with low cache reuse ──────────────────────────
    // Only counts SubagentStop events (real agent calls), not Stop events on the
    // main agent. The previous version filtered `agent IS NOT NULL` which was
    // always true and silently caught all turns.
    const [agentRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*)                                                                  AS call_count,
        AVG(COALESCE(e.input_tokens, 0) + COALESCE(e.cache_creation_tokens, 0))   AS avg_input,
        SUM(COALESCE(e.cache_read_tokens, 0))                                     AS total_cache_read,
        SUM(COALESCE(e.input_tokens, 0) + COALESCE(e.cache_creation_tokens, 0))   AS total_input
      FROM cc_events e
      WHERE e.event_type = 'SubagentStop'
        AND e.input_tokens IS NOT NULL
        AND e.timestamp >= datetime('now', '-30 days')
    `);
    const agent = agentRows[0];
    const agentCount = Number(agent?.call_count ?? 0);
    const avgInput = Number(agent?.avg_input ?? 0);
    const totalInput = Number(agent?.total_input ?? 0);
    const totalCacheRead = Number(agent?.total_cache_read ?? 0);
    // Fraction of all input bytes the model saw that came from cache. Ranges 0–1.
    // (Previous version divided cache_read by fresh_input only, which exceeded 100%
    // on well-cached orchestrators because the cached system prompt dwarfs per-call
    // fresh input.)
    const totalBytesIn = totalInput + totalCacheRead;
    const cacheRatio = totalBytesIn > 0 ? totalCacheRead / totalBytesIn : 0;
    if (agentCount >= t.agent_min_calls && avgInput > t.agent_min_avg_input && cacheRatio < t.agent_max_cache_ratio) {
      // Potential savings: if 70% of currently-uncached input were cached, those
      // tokens would cost $0.30/M instead of $3/M. Stated assumption surfaced in
      // savingSubtext below — never hide assumptions.
      const uncached = Math.max(0, totalInput - totalCacheRead);
      const potentialSaving = uncached * CACHE_HIT_ASSUMPTION * (3.0 - 0.30) / 1000000;
      insights.push({
        id: 'subagent-cache-miss',
        type: 'cache',
        title: `Subagent calls average ${Math.round(avgInput / 1000)}k tokens with low cache reuse`,
        body: `Cache read ratio is ${Math.round(cacheRatio * 100)}% over the last 30 days across ${agentCount} subagent calls. Enabling prompt caching on orchestrator calls typically saves 70–90% of input costs.`,
        saving: potentialSaving > 0.50 ? `~$${potentialSaving.toFixed(2)} potential 30-day saving` : undefined,
        savingSubtext: potentialSaving > 0.50 ? `assumes ${Math.round(CACHE_HIT_ASSUMPTION * 100)}% cache hit rate` : undefined,
        details: {
          metrics: [
            { label: 'Subagent calls',   value: `${agentCount}` },
            { label: 'Avg input tokens', value: `${Math.round(avgInput / 1000)}k` },
            { label: 'Cache reuse',      value: `${Math.round(cacheRatio * 100)}%` },
            { label: 'Window',           value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min calls',         value: `≥ ${t.agent_min_calls}` },
            { label: 'Min avg input',     value: `> ${Math.round(t.agent_min_avg_input / 1000)}k tokens` },
            { label: 'Max cache reuse',   value: `< ${Math.round(t.agent_max_cache_ratio * 100)}%` },
          ],
        },
      });
    }

    // ── Rule 3: Sessions with repeated Edit failures (last 30 days) ──────────
    const [retryRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(DISTINCT session_id) AS session_count,
        AVG(edit_count)            AS avg_edits
      FROM (
        SELECT session_id, COUNT(*) AS edit_count
        FROM cc_events
        WHERE event_type = 'PostToolUse'
          AND tool_name = 'Edit'
          AND is_error = 1
          AND timestamp >= datetime('now', '-30 days')
        GROUP BY session_id
        HAVING edit_count >= ${t.edit_retries_min_per_session}
      ) t
    `);
    const retry = retryRows[0];
    if (retry && Number(retry.session_count) >= t.edit_retries_min_sessions) {
      insights.push({
        id: 'edit-retries',
        type: 'pattern',
        title: `${retry.session_count} sessions had repeated Edit failures (last 30 days, avg ${Math.round(Number(retry.avg_edits))} per session)`,
        body: `Repeated Edit errors often indicate context drift or stale context — the model lost track of the current file state. Try breaking large edits into smaller, scoped tasks.`,
        details: {
          metrics: [
            { label: 'Sessions flagged',     value: `${retry.session_count}` },
            { label: 'Avg failures/session', value: `${Math.round(Number(retry.avg_edits))}` },
            { label: 'Window',               value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',         value: `≥ ${t.edit_retries_min_sessions}` },
            { label: 'Min failures/session', value: `≥ ${t.edit_retries_min_per_session}` },
          ],
        },
      });
    }

    // ── Weekly digest data ───────────────────────────────────────────────────
    const [weekRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COALESCE(SUM(${COST_SQL}), 0) AS week_cost,
        COUNT(DISTINCT e.session_id)  AS week_sessions,
        COALESCE(SUM(COALESCE(e.cache_read_tokens,0)), 0) AS week_cache_read,
        COALESCE(SUM(COALESCE(e.input_tokens,0) + COALESCE(e.cache_creation_tokens,0)), 0) AS week_input
      FROM cc_events e
      WHERE e.timestamp >= datetime('now', '-7 days')
        AND e.event_type IN ('Stop', 'SubagentStop')
        AND e.input_tokens IS NOT NULL
    `);

    const [prevWeekRows] = await pool.query<RowDataPacket[]>(`
      SELECT COALESCE(SUM(${COST_SQL}), 0) AS prev_cost
      FROM cc_events e
      WHERE e.timestamp >= datetime('now', '-14 days')
        AND e.timestamp < datetime('now', '-7 days')
        AND e.event_type IN ('Stop', 'SubagentStop')
        AND e.input_tokens IS NOT NULL
    `);

    const [topToolsRows] = await pool.query<RowDataPacket[]>(`
      SELECT tool_name, COUNT(*) AS uses
      FROM cc_events
      WHERE event_type = 'PostToolUse'
        AND tool_name IS NOT NULL
        AND timestamp >= datetime('now', '-7 days')
      GROUP BY tool_name
      ORDER BY uses DESC
      LIMIT 5
    `);

    const [topProjectsRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        SUM(${COST_SQL}) AS cost
      FROM cc_events e
      JOIN cc_sessions s ON e.session_id = s.session_id
      WHERE e.timestamp >= datetime('now', '-7 days')
        AND e.event_type IN ('Stop', 'SubagentStop')
        AND e.input_tokens IS NOT NULL
      GROUP BY s.project_dir
      ORDER BY cost DESC
      LIMIT 3
    `);

    const week = weekRows[0] ?? {};
    const weekCost = Number(week.week_cost ?? 0);
    const prevCost = Number(prevWeekRows[0]?.prev_cost ?? 0);
    const weekCacheRatio = Number(week.week_input ?? 0) > 0
      ? Math.round(Number(week.week_cache_read) / Number(week.week_input) * 100)
      : 0;

    return NextResponse.json({
      insights,
      digest: {
        week_cost: weekCost,
        prev_week_cost: prevCost,
        week_sessions: Number(week.week_sessions ?? 0),
        cache_efficiency: weekCacheRatio,
        top_tools: topToolsRows.map(r => ({ name: r.tool_name, uses: Number(r.uses) })),
        top_projects: topProjectsRows.map(r => ({ name: r.project_name, cost: Number(r.cost) })),
      },
      thresholds: t,
      threshold_defaults: DEFAULTS,
    });
  } catch (error) {
    console.error('Insights error:', error);
    return NextResponse.json({ insights: [], digest: null }, { status: 500 });
  }
}
