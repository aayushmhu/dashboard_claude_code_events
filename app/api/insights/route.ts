import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// Per-model cost expression. Sonnet is the default (Claude Code's default model);
// Opus is ~5× Sonnet and Haiku is ~4× cheaper. Applying a single hardcoded rate to
// mixed-model data understates Opus cost and overstates Haiku cost.
const COST_SQL = `(
  CASE
    WHEN e.model LIKE '%opus%' THEN
      COALESCE(e.input_tokens, 0)          * 5.0   / 1000000 +
      COALESCE(e.output_tokens, 0)         * 25.0  / 1000000 +
      COALESCE(e.cache_creation_tokens, 0) * 10.0  / 1000000 +
      COALESCE(e.cache_read_tokens, 0)     * 0.50  / 1000000
    WHEN e.model LIKE '%haiku%' THEN
      COALESCE(e.input_tokens, 0)          * 1.0   / 1000000 +
      COALESCE(e.output_tokens, 0)         * 5.0   / 1000000 +
      COALESCE(e.cache_creation_tokens, 0) * 2.0   / 1000000 +
      COALESCE(e.cache_read_tokens, 0)     * 0.10  / 1000000
    ELSE
      COALESCE(e.input_tokens, 0)          * 3.0   / 1000000 +
      COALESCE(e.output_tokens, 0)         * 15.0  / 1000000 +
      COALESCE(e.cache_creation_tokens, 0) * 6.0   / 1000000 +
      COALESCE(e.cache_read_tokens, 0)     * 0.30  / 1000000
  END
)`;

// Haiku alternative cost (used only as the "what if you ran this on Haiku" baseline).
const HAIKU_COST_SQL = `(
  COALESCE(e.input_tokens, 0)          * 1.0    / 1000000 +
  COALESCE(e.output_tokens, 0)         * 5.0    / 1000000 +
  COALESCE(e.cache_creation_tokens, 0) * 2.0    / 1000000 +
  COALESCE(e.cache_read_tokens, 0)     * 0.10   / 1000000
)`;

const TRIVIAL_TOOLS = `('Bash','Read','Glob','LS','Grep','WebSearch','WebFetch')`;

// Compact human-readable token count for card body strings (server-side).
function formatTokensInline(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const DEFAULTS = {
  opus_min_turns: 5,
  opus_min_cost: 0.10,
  agent_min_calls: 5,
  agent_min_avg_input: 50000,
  agent_max_cache_ratio: 0.30,
  edit_retries_min_sessions: 2,
  edit_retries_min_per_session: 3,
  // Long-running tools
  long_tool_min_calls: 5,
  long_tool_min_duration_ms: 60000,
  // Daily cost spike
  cost_spike_ratio: 3.0,
  cost_spike_min_baseline: 0.50,
  // Opus verbose output
  opus_verbose_min_turns: 10,
  opus_verbose_ratio: 2.0,
  // File-read thrashing
  read_thrash_min_per_session: 5,
  read_thrash_min_sessions: 2,
  // Cache write without read
  cache_write_no_read_min_sessions: 3,
  // Tool error retry loops (consecutive same-tool failures)
  retry_loop_min_sessions: 2,
  retry_loop_min_consecutive: 3,
  // Prompt caching not enabled
  no_caching_min_sessions: 3,
  no_caching_min_input: 50000,
  // Subagent explosion
  subagent_explosion_min_sessions: 2,
  subagent_explosion_min_calls: 20,
  // Daily volume anomaly
  volume_spike_ratio: 3.0,
  volume_spike_min_baseline: 50,
  // High tool error rate
  high_error_min_sessions: 2,
  high_error_min_tool_calls: 10,
  high_error_rate_threshold: 0.30,
  // Opus on research tasks (no Edit/Write)
  opus_research_min_sessions: 2,
  opus_research_min_tools: 10,
  // Opus tiny-output
  opus_small_min_turns: 10,
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

    // ── Rule 4: Long-running tool calls ──────────────────────────────────────
    const [slowToolRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS slow_calls,
        MAX(duration_ms) AS max_ms,
        tool_name
      FROM cc_events
      WHERE event_type = 'PostToolUse'
        AND duration_ms IS NOT NULL
        AND duration_ms >= ${t.long_tool_min_duration_ms}
        AND timestamp >= datetime('now', '-30 days')
      GROUP BY tool_name
      ORDER BY slow_calls DESC
      LIMIT 1
    `);
    const [[slowTotalRow]] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS total_slow,
        MAX(duration_ms) AS overall_max_ms
      FROM cc_events
      WHERE event_type = 'PostToolUse'
        AND duration_ms IS NOT NULL
        AND duration_ms >= ${t.long_tool_min_duration_ms}
        AND timestamp >= datetime('now', '-30 days')
    `);
    const totalSlow = Number(slowTotalRow?.total_slow ?? 0);
    if (totalSlow >= t.long_tool_min_calls && slowToolRows[0]) {
      const top = slowToolRows[0];
      const maxMs = Number(slowTotalRow.overall_max_ms ?? 0);
      const thresholdSec = Math.round(t.long_tool_min_duration_ms / 1000);
      insights.push({
        id: 'long-running-tools',
        type: 'pattern',
        title: `${totalSlow} tool calls took longer than ${thresholdSec}s (last 30 days)`,
        body: `Worst offender was \`${top.tool_name}\` with a peak of ${(maxMs / 1000).toFixed(1)}s. Long tool calls keep the streaming connection open while Claude waits — consider narrowing scope, raising timeouts, or splitting the work.`,
        details: {
          metrics: [
            { label: 'Slow tool calls',    value: `${totalSlow}` },
            { label: 'Peak duration',      value: `${(maxMs / 1000).toFixed(1)}s` },
            { label: 'Top offender',       value: String(top.tool_name) },
            { label: 'Window',             value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min slow calls',     value: `≥ ${t.long_tool_min_calls}` },
            { label: 'Min duration',       value: `> ${thresholdSec}s` },
          ],
        },
      });
    }

    // ── Rule 5: Daily cost spike (any day in last 14 d ≥ratio× trailing 7-day avg)
    // Computed in two steps: aggregate per-day cost, then compare each day to the
    // trailing 7-day rolling mean ending the day before.
    const [dailyCostRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        date(e.timestamp) AS day,
        SUM(${COST_SQL}) AS cost
      FROM cc_events e
      WHERE e.timestamp >= datetime('now', '-21 days')
        AND e.event_type IN ('Stop', 'SubagentStop')
        AND e.input_tokens IS NOT NULL
      GROUP BY date(e.timestamp)
      ORDER BY day ASC
    `);
    const dailyMap = new Map<string, number>(
      dailyCostRows.map(r => [String(r.day), Number(r.cost)])
    );
    // Build last 14 days as the "candidate" window
    const today = new Date();
    let spikeDay: { day: string; cost: number; baseline: number; ratio: number } | null = null;
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const dayKey = d.toISOString().slice(0, 10);
      const cost = dailyMap.get(dayKey) ?? 0;
      if (cost <= t.cost_spike_min_baseline) continue;
      // Trailing 7-day average ending the day before
      let sum = 0;
      let n = 0;
      for (let j = 1; j <= 7; j++) {
        const bd = new Date(d.getTime() - j * 86400000);
        const bk = bd.toISOString().slice(0, 10);
        if (dailyMap.has(bk)) { sum += dailyMap.get(bk)!; n += 1; }
      }
      if (n < 3) continue;  // not enough baseline
      const baseline = sum / n;
      if (baseline <= 0) continue;
      const ratio = cost / baseline;
      if (ratio >= t.cost_spike_ratio && (!spikeDay || ratio > spikeDay.ratio)) {
        spikeDay = { day: dayKey, cost, baseline, ratio };
      }
    }
    if (spikeDay) {
      insights.push({
        id: 'daily-cost-spike',
        type: 'cost',
        title: `Cost spike on ${spikeDay.day}: $${spikeDay.cost.toFixed(2)} (${spikeDay.ratio.toFixed(1)}× usual)`,
        body: `Your trailing 7-day average was ~$${spikeDay.baseline.toFixed(2)}/day. Open the Sessions filter for that date to see what changed.`,
        details: {
          metrics: [
            { label: 'Day',                value: spikeDay.day },
            { label: 'Cost that day',      value: `$${spikeDay.cost.toFixed(2)}` },
            { label: '7-day avg baseline', value: `$${spikeDay.baseline.toFixed(2)}` },
            { label: 'Ratio',              value: `${spikeDay.ratio.toFixed(2)}×` },
            { label: 'Window',             value: 'last 14 days' },
          ],
          thresholds: [
            { label: 'Min ratio',          value: `≥ ${t.cost_spike_ratio}×` },
            { label: 'Min cost floor',     value: `> $${t.cost_spike_min_baseline.toFixed(2)}` },
          ],
        },
      });
    }

    // ── Rule 6: Opus verbose output (Opus turns where output_tokens > ratio×input)
    // `input_tokens > 500` and `output_tokens > 2000` filter out the normal
    // cached-conversation pattern where a 5-token fresh prompt yields a 1000-token
    // response (ratio looks huge but that's expected, not verbose).
    const [verboseRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS turns,
        SUM(COALESCE(e.output_tokens, 0)) AS total_output,
        AVG(CAST(e.output_tokens AS REAL) / NULLIF(e.input_tokens, 0)) AS avg_ratio
      FROM cc_events e
      WHERE e.event_type IN ('Stop', 'SubagentStop')
        AND e.model LIKE '%opus%'
        AND e.timestamp >= datetime('now', '-30 days')
        AND COALESCE(e.input_tokens, 0) > 500
        AND COALESCE(e.output_tokens, 0) > 2000
        AND COALESCE(e.output_tokens, 0) > ${t.opus_verbose_ratio} * COALESCE(e.input_tokens, 0)
    `);
    const verbose = verboseRows[0];
    if (verbose && Number(verbose.turns) >= t.opus_verbose_min_turns) {
      const verboseTurns = Number(verbose.turns);
      const totalOutput = Number(verbose.total_output);
      const avgRatio = Number(verbose.avg_ratio);
      // Saving estimate: if output were halved, save 0.5 × output × $25/M (Opus output rate)
      const potentialSaving = 0.5 * totalOutput * 25 / 1_000_000;
      insights.push({
        id: 'opus-verbose-output',
        type: 'cost',
        title: `${verboseTurns} Opus turns produced ${avgRatio.toFixed(1)}× more output than input`,
        body: `Opus output is the most expensive token type ($25/M). On these turns the model produced disproportionately more output than the prompt provided. A "be concise" system-prompt hint often trims this significantly.`,
        saving: potentialSaving > 0.50 ? `~$${potentialSaving.toFixed(2)} potential saving` : undefined,
        savingSubtext: potentialSaving > 0.50 ? `assumes output volume halved · at Opus rates` : undefined,
        details: {
          metrics: [
            { label: 'Verbose Opus turns', value: `${verboseTurns}` },
            { label: 'Avg output:input',   value: `${avgRatio.toFixed(2)}×` },
            { label: 'Total output',       value: `${(totalOutput / 1000).toFixed(1)}k tokens` },
            { label: 'Window',             value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min turns',          value: `≥ ${t.opus_verbose_min_turns}` },
            { label: 'Min output:input',   value: `> ${t.opus_verbose_ratio}×` },
          ],
        },
      });
    }

    // ── Rule 7: File-read thrashing ──────────────────────────────────────────
    // Same file Read ≥N times in a session, in ≥M sessions
    const [thrashRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        file_path,
        COUNT(DISTINCT session_id) AS session_count,
        SUM(read_count) AS total_reads,
        MAX(read_count) AS max_in_session
      FROM (
        SELECT
          session_id,
          json_extract(tool_input, '$.file_path') AS file_path,
          COUNT(*) AS read_count
        FROM cc_events
        WHERE event_type = 'PostToolUse'
          AND tool_name = 'Read'
          AND json_extract(tool_input, '$.file_path') IS NOT NULL
          AND timestamp >= datetime('now', '-30 days')
        GROUP BY session_id, file_path
        HAVING read_count >= ${t.read_thrash_min_per_session}
      ) t
      GROUP BY file_path
      HAVING session_count >= ${t.read_thrash_min_sessions}
      ORDER BY total_reads DESC
      LIMIT 1
    `);
    if (thrashRows[0]) {
      const top = thrashRows[0];
      const filePath = String(top.file_path);
      const fileName = filePath.split('/').pop() || filePath;
      insights.push({
        id: 'file-read-thrashing',
        type: 'pattern',
        title: `\`${fileName}\` was read ${Number(top.total_reads)} times across ${Number(top.session_count)} sessions`,
        body: `Re-reading the same file inside a conversation usually means Claude lost track of its current state. Each re-read pays input tokens for the full file contents again — see if the workflow can be tightened, e.g. using Edit instead of Read+Write or summarising long files once.`,
        details: {
          metrics: [
            { label: 'File',               value: filePath },
            { label: 'Total re-reads',     value: `${Number(top.total_reads)}` },
            { label: 'Sessions affected',  value: `${Number(top.session_count)}` },
            { label: 'Peak in one session',value: `${Number(top.max_in_session)}` },
            { label: 'Window',             value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min reads/session',  value: `≥ ${t.read_thrash_min_per_session}` },
            { label: 'Min sessions',       value: `≥ ${t.read_thrash_min_sessions}` },
          ],
        },
      });
    }

    // ── Rule 8: Cache write without read ─────────────────────────────────────
    const [cwnrRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(DISTINCT session_id) AS session_count,
        SUM(cache_creation_tokens) AS wasted_writes
      FROM (
        SELECT
          session_id,
          SUM(COALESCE(cache_creation_tokens, 0)) AS cache_creation_tokens,
          SUM(COALESCE(cache_read_tokens, 0))     AS cache_read_tokens,
          COUNT(*) AS turn_count
        FROM cc_events
        WHERE event_type IN ('Stop', 'SubagentStop')
          AND timestamp >= datetime('now', '-30 days')
        GROUP BY session_id
        HAVING cache_creation_tokens >= 5000
           AND cache_read_tokens < 500
           AND turn_count >= 3
      ) t
    `);
    const cwnr = cwnrRows[0];
    if (cwnr && Number(cwnr.session_count) >= t.cache_write_no_read_min_sessions) {
      // Premium paid: cache_creation (1h rate) costs 2× fresh input ($6 vs $3 per M for Sonnet).
      // Sloppy but indicative: take Sonnet's $3/M premium.
      const wastedPremium = Number(cwnr.wasted_writes) * 3 / 1_000_000;
      insights.push({
        id: 'cache-write-without-read',
        type: 'cache',
        title: `${cwnr.session_count} sessions paid the cache write premium without reading back`,
        body: `Cache writes (1h) cost 2× fresh input ($6/M vs $3/M on Sonnet). When the cache isn't reused, that premium is just wasted spend — usually because the cache key changed between turns or the session ended too quickly.`,
        saving: wastedPremium > 0.10 ? `~$${wastedPremium.toFixed(2)} premium wasted` : undefined,
        savingSubtext: wastedPremium > 0.10 ? `at Sonnet cache-write premium` : undefined,
        details: {
          metrics: [
            { label: 'Affected sessions', value: `${cwnr.session_count}` },
            { label: 'Cache writes that never read', value: `${formatTokensInline(Number(cwnr.wasted_writes))}` },
            { label: 'Window',            value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',      value: `≥ ${t.cache_write_no_read_min_sessions}` },
            { label: 'Min write/session', value: `≥ 5000 tokens` },
            { label: 'Max read/session',  value: `< 500 tokens` },
          ],
        },
      });
    }

    // ── Rule 9: Tool error retry loops ───────────────────────────────────────
    // Detected per-session by walking PostToolUse events in chronological order and
    // tracking the longest run of consecutive same-tool failures.
    const [loopRawRows] = await pool.query<RowDataPacket[]>(`
      SELECT session_id, tool_name, is_error, timestamp
      FROM cc_events
      WHERE event_type = 'PostToolUse'
        AND tool_name IS NOT NULL
        AND timestamp >= datetime('now', '-30 days')
      ORDER BY session_id, timestamp ASC
    `);
    const loopBySession = new Map<string, { tool: string; count: number }>();
    let curSession = '';
    let curTool = '';
    let curRun = 0;
    let curMaxRun = 0;
    let curMaxTool = '';
    const finalizeSession = (s: string) => {
      if (s && curMaxRun >= t.retry_loop_min_consecutive) {
        loopBySession.set(s, { tool: curMaxTool, count: curMaxRun });
      }
      curSession = ''; curTool = ''; curRun = 0; curMaxRun = 0; curMaxTool = '';
    };
    for (const row of loopRawRows) {
      const sid = String(row.session_id);
      if (sid !== curSession) {
        finalizeSession(curSession);
        curSession = sid;
      }
      const tool = String(row.tool_name);
      const err = Number(row.is_error) === 1;
      if (err && tool === curTool) {
        curRun += 1;
      } else if (err) {
        curTool = tool;
        curRun = 1;
      } else {
        curTool = ''; curRun = 0;
      }
      if (curRun > curMaxRun) {
        curMaxRun = curRun;
        curMaxTool = curTool;
      }
    }
    finalizeSession(curSession);
    if (loopBySession.size >= t.retry_loop_min_sessions) {
      // Pick the worst-offending tool across sessions for the card body
      const toolCounts = new Map<string, number>();
      for (const v of loopBySession.values()) toolCounts.set(v.tool, (toolCounts.get(v.tool) ?? 0) + 1);
      let topTool = '';
      let topCount = 0;
      for (const [tool, n] of toolCounts) if (n > topCount) { topTool = tool; topCount = n; }
      insights.push({
        id: 'tool-error-retry-loops',
        type: 'pattern',
        title: `${loopBySession.size} sessions hit a retry loop (${t.retry_loop_min_consecutive}+ consecutive failures)`,
        body: `Most-affected tool: \`${topTool}\`. Consecutive failures usually mean the model is convinced the same approach will work — break the loop manually or change the approach.`,
        details: {
          metrics: [
            { label: 'Sessions with loops', value: `${loopBySession.size}` },
            { label: 'Top loop tool',       value: topTool },
            { label: 'Window',              value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',        value: `≥ ${t.retry_loop_min_sessions}` },
            { label: 'Min consecutive failures', value: `≥ ${t.retry_loop_min_consecutive}` },
          ],
        },
      });
    }

    // ── Rule 10: Prompt caching not enabled ──────────────────────────────────
    const [noCacheRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS session_count,
        SUM(total_input) AS total_fresh_input
      FROM (
        SELECT
          session_id,
          SUM(COALESCE(input_tokens, 0))          AS total_input,
          SUM(COALESCE(cache_creation_tokens, 0)) AS total_writes,
          SUM(COALESCE(cache_read_tokens, 0))     AS total_reads
        FROM cc_events
        WHERE event_type IN ('Stop', 'SubagentStop')
          AND timestamp >= datetime('now', '-30 days')
        GROUP BY session_id
        HAVING total_writes = 0
           AND total_reads  = 0
           AND total_input >= ${t.no_caching_min_input}
      ) t
    `);
    const noCache = noCacheRows[0];
    if (noCache && Number(noCache.session_count) >= t.no_caching_min_sessions) {
      const freshInput = Number(noCache.total_fresh_input);
      // If 70% of fresh input had been cached on subsequent turns, save (0.7 × $3 − $0.30)/M = $1.89/M
      const potentialSaving = freshInput * 0.7 * (3.0 - 0.30) / 1_000_000;
      insights.push({
        id: 'prompt-caching-not-enabled',
        type: 'cache',
        title: `${noCache.session_count} sessions ran with prompt caching disabled`,
        body: `These sessions had no cache creation or reads at all. Enabling prompt caching on the system prompt + conversation history typically cuts input cost by 70–90%.`,
        saving: potentialSaving > 1.00 ? `~$${potentialSaving.toFixed(2)} potential savings` : undefined,
        savingSubtext: potentialSaving > 1.00 ? `assumes 70% cache hit on fresh input` : undefined,
        details: {
          metrics: [
            { label: 'Sessions without caching', value: `${noCache.session_count}` },
            { label: 'Total fresh input',        value: `${formatTokensInline(freshInput)}` },
            { label: 'Window',                   value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',             value: `≥ ${t.no_caching_min_sessions}` },
            { label: 'Min fresh input/session',  value: `≥ ${formatTokensInline(t.no_caching_min_input)}` },
          ],
        },
      });
    }

    // ── Rule 11: Subagent explosion ──────────────────────────────────────────
    const [explosionRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS session_count, AVG(call_count) AS avg_calls, MAX(call_count) AS max_calls
      FROM (
        SELECT session_id, COUNT(*) AS call_count
        FROM cc_events
        WHERE event_type = 'SubagentStop'
          AND timestamp >= datetime('now', '-30 days')
        GROUP BY session_id
        HAVING call_count >= ${t.subagent_explosion_min_calls}
      ) t
    `);
    const explosion = explosionRows[0];
    if (explosion && Number(explosion.session_count) >= t.subagent_explosion_min_sessions) {
      insights.push({
        id: 'subagent-explosion',
        type: 'pattern',
        title: `${explosion.session_count} sessions used the Agent tool ${Math.round(Number(explosion.avg_calls))}+ times (peak ${Number(explosion.max_calls)})`,
        body: `Every subagent call pays its own cache-creation overhead. When the main agent could handle work directly, heavy delegation just multiplies cost. Worth reviewing whether the subagent count is justified.`,
        details: {
          metrics: [
            { label: 'Affected sessions', value: `${explosion.session_count}` },
            { label: 'Avg calls/session', value: `${Math.round(Number(explosion.avg_calls))}` },
            { label: 'Peak in one session', value: `${Number(explosion.max_calls)}` },
            { label: 'Window',            value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',      value: `≥ ${t.subagent_explosion_min_sessions}` },
            { label: 'Min calls/session', value: `≥ ${t.subagent_explosion_min_calls}` },
          ],
        },
      });
    }

    // ── Rule 12: Daily volume anomaly (event count, not cost) ────────────────
    const [dailyVolRows] = await pool.query<RowDataPacket[]>(`
      SELECT date(timestamp) AS day, COUNT(*) AS events
      FROM cc_events
      WHERE timestamp >= datetime('now', '-21 days')
        AND event_type IN ('Stop', 'SubagentStop')
      GROUP BY date(timestamp)
      ORDER BY day ASC
    `);
    const dailyVol = new Map<string, number>(dailyVolRows.map(r => [String(r.day), Number(r.events)]));
    const todayDate = new Date();
    let volSpike: { day: string; events: number; baseline: number; ratio: number } | null = null;
    for (let i = 0; i < 14; i++) {
      const d = new Date(todayDate.getTime() - i * 86400000);
      const dk = d.toISOString().slice(0, 10);
      const events = dailyVol.get(dk) ?? 0;
      if (events < t.volume_spike_min_baseline) continue;
      let sum = 0;
      let n = 0;
      for (let j = 1; j <= 7; j++) {
        const bd = new Date(d.getTime() - j * 86400000);
        const bk = bd.toISOString().slice(0, 10);
        if (dailyVol.has(bk)) { sum += dailyVol.get(bk)!; n += 1; }
      }
      if (n < 3) continue;
      const baseline = sum / n;
      if (baseline <= 0) continue;
      const ratio = events / baseline;
      if (ratio >= t.volume_spike_ratio && (!volSpike || ratio > volSpike.ratio)) {
        volSpike = { day: dk, events, baseline, ratio };
      }
    }
    if (volSpike) {
      insights.push({
        id: 'daily-volume-anomaly',
        type: 'pattern',
        title: `Activity spike on ${volSpike.day}: ${volSpike.events} events (${volSpike.ratio.toFixed(1)}× usual)`,
        body: `Trailing 7-day average was ${Math.round(volSpike.baseline)}/day. High-volume days don't always cost more (depends on token sizes) but are worth reviewing in context.`,
        details: {
          metrics: [
            { label: 'Day',               value: volSpike.day },
            { label: 'Events that day',   value: `${volSpike.events}` },
            { label: '7-day avg baseline',value: `${Math.round(volSpike.baseline)}` },
            { label: 'Ratio',             value: `${volSpike.ratio.toFixed(2)}×` },
            { label: 'Window',            value: 'last 14 days' },
          ],
          thresholds: [
            { label: 'Min ratio',         value: `≥ ${t.volume_spike_ratio}×` },
            { label: 'Min event floor',   value: `> ${t.volume_spike_min_baseline}` },
          ],
        },
      });
    }

    // ── Rule 13: High tool error rate ────────────────────────────────────────
    const [errorRateRows] = await pool.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS session_count, AVG(error_rate) AS avg_rate, MAX(error_rate) AS max_rate
      FROM (
        SELECT
          session_id,
          COUNT(*) AS total_calls,
          SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS errors,
          (SUM(CASE WHEN is_error = 1 THEN 1.0 ELSE 0 END) / COUNT(*)) AS error_rate
        FROM cc_events
        WHERE event_type = 'PostToolUse'
          AND timestamp >= datetime('now', '-30 days')
        GROUP BY session_id
        HAVING total_calls >= ${t.high_error_min_tool_calls}
           AND error_rate  >= ${t.high_error_rate_threshold}
      ) t
    `);
    const errorRate = errorRateRows[0];
    if (errorRate && Number(errorRate.session_count) >= t.high_error_min_sessions) {
      const avgPct = Math.round(Number(errorRate.avg_rate) * 100);
      const maxPct = Math.round(Number(errorRate.max_rate) * 100);
      insights.push({
        id: 'high-tool-error-rate',
        type: 'pattern',
        title: `${errorRate.session_count} sessions had a ${avgPct}%+ tool error rate (peak ${maxPct}%)`,
        body: `Persistent high error rates usually point at environment issues — stale paths, missing dependencies, wrong directory. Failed tool calls still cost a turn, so this is cumulative waste.`,
        details: {
          metrics: [
            { label: 'Affected sessions', value: `${errorRate.session_count}` },
            { label: 'Avg error rate',    value: `${avgPct}%` },
            { label: 'Peak error rate',   value: `${maxPct}%` },
            { label: 'Window',            value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',      value: `≥ ${t.high_error_min_sessions}` },
            { label: 'Min tool calls',    value: `≥ ${t.high_error_min_tool_calls}` },
            { label: 'Min error rate',    value: `≥ ${Math.round(t.high_error_rate_threshold * 100)}%` },
          ],
        },
      });
    }

    // ── Rule 14: Opus on research-only sessions ──────────────────────────────
    // Counts DISTINCT sessions, not turns — fixes earlier misnamed COUNT(*).
    const [opusResearchRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(DISTINCT e.session_id) AS session_count,
        SUM(${COST_SQL}) AS opus_cost
      FROM cc_events e
      WHERE e.event_type IN ('Stop', 'SubagentStop')
        AND e.model LIKE '%opus%'
        AND e.timestamp >= datetime('now', '-30 days')
        AND e.session_id IN (
          SELECT session_id FROM cc_events
          WHERE event_type = 'PostToolUse'
            AND timestamp >= datetime('now', '-30 days')
          GROUP BY session_id
          HAVING SUM(CASE WHEN tool_name IN ('Edit', 'Write', 'NotebookEdit') THEN 1 ELSE 0 END) = 0
             AND COUNT(*) >= ${t.opus_research_min_tools}
        )
    `);
    const opusResearch = opusResearchRows[0];
    if (opusResearch && Number(opusResearch.session_count) >= t.opus_research_min_sessions) {
      const opusCost = Number(opusResearch.opus_cost);
      // Sonnet ≈ 5× cheaper than Opus across the board; saving ≈ 80% of opus cost
      const savings = opusCost * 0.80;
      insights.push({
        id: 'opus-on-research-tasks',
        type: 'cost',
        title: `${opusResearch.session_count} Opus sessions did research-only work (no Edit/Write)`,
        body: `Opus excels at deep reasoning and code generation. Pure read/search/grep sessions don't tap that — Sonnet handles them at 5× lower cost.`,
        saving: savings > 0.50 ? `~$${savings.toFixed(2)} could have been saved on Sonnet` : undefined,
        savingSubtext: savings > 0.50 ? `assumes same usage on Sonnet rates` : undefined,
        details: {
          metrics: [
            { label: 'Research-only Opus sessions', value: `${opusResearch.session_count}` },
            { label: 'Total Opus cost',             value: `$${opusCost.toFixed(2)}` },
            { label: 'Window',                      value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min sessions',        value: `≥ ${t.opus_research_min_sessions}` },
            { label: 'Min tool calls',      value: `≥ ${t.opus_research_min_tools}` },
          ],
        },
      });
    }

    // ── Rule 15: Opus tiny output for substantial prompts ────────────────────
    const [opusSmallRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS turns,
        SUM(${COST_SQL}) AS opus_cost
      FROM cc_events e
      WHERE e.event_type IN ('Stop', 'SubagentStop')
        AND e.model LIKE '%opus%'
        AND e.timestamp >= datetime('now', '-30 days')
        AND COALESCE(e.input_tokens, 0) >= 1000
        AND COALESCE(e.output_tokens, 0) <= 200
    `);
    const opusSmall = opusSmallRows[0];
    if (opusSmall && Number(opusSmall.turns) >= t.opus_small_min_turns) {
      const opusCost = Number(opusSmall.opus_cost);
      const savings = opusCost * 0.80;  // Sonnet ≈ 1/5 cost
      insights.push({
        id: 'opus-small-output',
        type: 'cost',
        title: `${opusSmall.turns} Opus turns produced ≤200 tokens of output despite large prompts`,
        body: `Opus is priced for depth of reasoning. If output is short, you're paying Opus rates without using its strengths. Sonnet handles short-output work at 5× lower cost.`,
        saving: savings > 0.50 ? `~$${savings.toFixed(2)} could have been saved on Sonnet` : undefined,
        savingSubtext: savings > 0.50 ? `at Sonnet rates for these turns` : undefined,
        details: {
          metrics: [
            { label: 'Small-output Opus turns', value: `${opusSmall.turns}` },
            { label: 'Total Opus cost on these', value: `$${opusCost.toFixed(2)}` },
            { label: 'Window',                  value: 'last 30 days' },
          ],
          thresholds: [
            { label: 'Min turns',         value: `≥ ${t.opus_small_min_turns}` },
            { label: 'Min input/turn',    value: `≥ 1000 tokens` },
            { label: 'Max output/turn',   value: `≤ 200 tokens` },
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
