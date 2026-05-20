import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionSummaryHeader {
  started_at: string;
  last_seen_at: string;
  duration_seconds: number;
  turn_count: number;
  total_tokens: number;
  total_cost: number;
  error_count: number;
  top_3_tools: string[];
}

export interface SessionSummaryParticipant {
  agent_value: string;
  agent_type: string;
  dispatch_count: number;
}

export interface SessionSummaryParticipants {
  has_main_agent: boolean;
  subagents: SessionSummaryParticipant[];
}

export interface SessionSummaryModelBreakdown {
  model_family: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface SessionSummaryPrompt {
  prompt_id: number;
  timestamp: string;
  prompt_text: string;          // truncated to 120 chars + … if longer
  turn_count: number;           // count of Stop/SubagentStop in window
  tool_call_count: number;
  file_edit_count: number;      // PostToolUse where tool_name IN (Edit,Write,MultiEdit,NotebookEdit)
  moment_cost: number;
  has_error: boolean;           // any is_error=1 in window
  top_tools: string[];          // top 3 PostToolUse tool_names by count
  tool_type_count: number;      // total distinct tools in window
  response_excerpt: string | null; // Phase 1.1: last main-agent assistant content in window
}

export interface SessionSummaryResponse {
  header: SessionSummaryHeader;
  participants: SessionSummaryParticipants;
  model_breakdown: SessionSummaryModelBreakdown[];
  prompts: SessionSummaryPrompt[];
}

// ─── Cost SQL fragment (per-row, used in multiple slices) ─────────────────────

const COST_EXPR = `
  CASE WHEN model LIKE '%opus%' THEN
    (input_tokens * 5.0 + output_tokens * 25.0 + cache_creation_tokens * 10.0 + cache_read_tokens * 0.50) / 1000000.0
  WHEN model LIKE '%haiku%' THEN
    (input_tokens * 1.0 + output_tokens * 5.0 + cache_creation_tokens * 2.0 + cache_read_tokens * 0.10) / 1000000.0
  ELSE
    (input_tokens * 3.0 + output_tokens * 15.0 + cache_creation_tokens * 6.0 + cache_read_tokens * 0.30) / 1000000.0
  END
`;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // ── Slice 1: Header stats ──────────────────────────────────────────────
    const [[headerRow]] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.started_at,
        s.last_seen_at,
        TIMESTAMPDIFF('SECOND', s.started_at, s.last_seen_at) AS duration_seconds,
        (SELECT COUNT(*) FROM cc_events
         WHERE session_id = s.session_id AND event_type = 'UserPromptSubmit') AS turn_count,
        (SELECT COALESCE(SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens), 0)
         FROM cc_events
         WHERE session_id = s.session_id AND event_type IN ('Stop','SubagentStop')) AS total_tokens,
        (SELECT ROUND(COALESCE(SUM(${COST_EXPR}), 0), 6)
         FROM cc_events
         WHERE session_id = s.session_id AND event_type IN ('Stop','SubagentStop')) AS total_cost,
        (SELECT COUNT(*) FROM cc_events
         WHERE session_id = s.session_id AND is_error = 1) AS error_count,
        (SELECT GROUP_CONCAT(tool_name, ',') FROM (
          SELECT tool_name, COUNT(*) AS cnt
          FROM cc_events
          WHERE session_id = s.session_id AND event_type = 'PostToolUse' AND tool_name IS NOT NULL
          GROUP BY tool_name ORDER BY cnt DESC LIMIT 3
        )) AS top_3_tools_raw
      FROM cc_sessions s
      WHERE s.session_id = ?`,
      [id]
    );

    if (!headerRow) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const header: SessionSummaryHeader = {
      started_at: String(headerRow.started_at),
      last_seen_at: String(headerRow.last_seen_at),
      duration_seconds: Number(headerRow.duration_seconds ?? 0),
      turn_count: Number(headerRow.turn_count ?? 0),
      total_tokens: Number(headerRow.total_tokens ?? 0),
      total_cost: Number(headerRow.total_cost ?? 0),
      error_count: Number(headerRow.error_count ?? 0),
      top_3_tools: headerRow.top_3_tools_raw
        ? String(headerRow.top_3_tools_raw).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
    };

    // ── Slice 2: Participants ──────────────────────────────────────────────
    const [participantRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        agent AS agent_value,
        COALESCE(NULLIF(json_extract(raw_payload, '$.agent_type'), ''), agent) AS agent_type,
        COUNT(*) AS dispatch_count
      FROM cc_events
      WHERE session_id = ? AND event_type = 'SubagentStop'
      GROUP BY agent_value, agent_type
      ORDER BY dispatch_count DESC`,
      [id]
    );

    const [[mainAgentCheck]] = await pool.query<RowDataPacket[]>(
      `SELECT 1 AS has_main FROM cc_events WHERE session_id = ? AND agent = 'main' LIMIT 1`,
      [id]
    );

    const participants: SessionSummaryParticipants = {
      has_main_agent: Boolean(mainAgentCheck?.has_main),
      subagents: participantRows.map((r) => ({
        agent_value: String(r.agent_value ?? ''),
        agent_type: String(r.agent_type ?? 'subagent'),
        dispatch_count: Number(r.dispatch_count ?? 0),
      })),
    };

    // ── Slice 4: Cost by model family ────────────────────────────────────
    const [breakdownRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        CASE WHEN model LIKE '%opus%' THEN 'opus'
             WHEN model LIKE '%haiku%' THEN 'haiku'
             ELSE 'sonnet'
        END AS model_family,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_creation_tokens) AS cache_write_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        ROUND(SUM(${COST_EXPR}), 6) AS cost
      FROM cc_events
      WHERE session_id = ? AND event_type IN ('Stop', 'SubagentStop')
      GROUP BY model_family
      ORDER BY cost DESC`,
      [id]
    );

    const model_breakdown: SessionSummaryModelBreakdown[] = breakdownRows.map((r) => ({
      model_family: String(r.model_family ?? 'sonnet'),
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
      cache_write_tokens: Number(r.cache_write_tokens ?? 0),
      cache_read_tokens: Number(r.cache_read_tokens ?? 0),
      cost: Number(r.cost ?? 0),
    }));

    // ── Slice 5: Prompts (Phase 1 + 1.1) ──────────────────────────────────────
    // Window-based: each UserPromptSubmit + everything until next UserPromptSubmit
    const [promptHeaders] = await pool.query<RowDataPacket[]>(
      `SELECT
        id AS prompt_id,
        timestamp,
        COALESCE(content, '') AS prompt_text,
        LEAD(id) OVER (ORDER BY id) AS next_prompt_id
      FROM cc_events
      WHERE session_id = ? AND event_type = 'UserPromptSubmit'
      ORDER BY id ASC`,
      [id]
    );

    // Fetch all relevant events for the windows in one go
    const [windowEvents] = await pool.query<RowDataPacket[]>(
      `SELECT id, event_type, tool_name, is_error,
              input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, model
       FROM cc_events
       WHERE session_id = ?
         AND event_type IN ('Stop','SubagentStop','PostToolUse')
       ORDER BY id ASC`,
      [id]
    );

    // Phase 1.1: assistant content for response excerpts
    const [assistantRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, COALESCE(agent,'') AS agent, COALESCE(content,'') AS content
       FROM cc_events
       WHERE session_id = ?
         AND role = 'assistant'
         AND content IS NOT NULL AND TRIM(content) != ''
       ORDER BY id ASC`,
      [id]
    );

    function costOf(r: RowDataPacket): number {
      const m = String(r.model ?? '').toLowerCase();
      const input = Number(r.input_tokens ?? 0);
      const output = Number(r.output_tokens ?? 0);
      const cw = Number(r.cache_creation_tokens ?? 0);
      const cr = Number(r.cache_read_tokens ?? 0);
      if (m.includes('opus'))  return (input*5 + output*25 + cw*10 + cr*0.5) / 1_000_000;
      if (m.includes('haiku')) return (input*1 + output*5 + cw*2  + cr*0.1) / 1_000_000;
      return                          (input*3 + output*15 + cw*6  + cr*0.3) / 1_000_000;
    }

    function stripMarkdown(raw: string): string {
      return raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(/\n+/g, ' ').trim();
    }

    const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

    const prompts: SessionSummaryPrompt[] = [];
    let eIdx = 0;
    let aIdx = 0;

    for (const ph of promptHeaders) {
      const startId = Number(ph.prompt_id);
      const endId = ph.next_prompt_id != null ? Number(ph.next_prompt_id) : Number.MAX_SAFE_INTEGER;

      let turn_count = 0;
      let tool_call_count = 0;
      let file_edit_count = 0;
      let moment_cost = 0;
      let has_error = false;
      const toolFreq: Record<string, number> = {};

      while (eIdx < windowEvents.length && Number(windowEvents[eIdx].id) <= startId) eIdx++;
      let scan = eIdx;
      while (scan < windowEvents.length && Number(windowEvents[scan].id) < endId) {
        const ev = windowEvents[scan];
        const evType = String(ev.event_type);
        if (evType === 'Stop' || evType === 'SubagentStop') {
          turn_count++;
          moment_cost += costOf(ev);
        } else if (evType === 'PostToolUse' && ev.tool_name) {
          tool_call_count++;
          const tn = String(ev.tool_name);
          toolFreq[tn] = (toolFreq[tn] || 0) + 1;
          if (FILE_TOOLS.has(tn)) file_edit_count++;
        }
        if (Number(ev.is_error ?? 0) === 1) has_error = true;
        scan++;
      }

      // Phase 1.1: last main-agent assistant content in window
      while (aIdx < assistantRows.length && Number(assistantRows[aIdx].id) <= startId) aIdx++;
      let aScan = aIdx;
      let lastMain: string | null = null;
      let lastAny: string | null = null;
      while (aScan < assistantRows.length && Number(assistantRows[aScan].id) < endId) {
        const row = assistantRows[aScan];
        const c = String(row.content ?? '');
        if (c) {
          lastAny = c;
          if (String(row.agent ?? '') === 'main') lastMain = c;
        }
        aScan++;
      }
      const raw = lastMain ?? lastAny;
      let response_excerpt: string | null = null;
      if (raw) {
        const s = stripMarkdown(raw);
        response_excerpt = s.length > 180 ? s.slice(0, 180) + '…' : (s || null);
      }

      const top_tools = Object.entries(toolFreq)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const ptxt = String(ph.prompt_text ?? '');
      const prompt_text = ptxt.length > 120 ? ptxt.slice(0, 120) + '…' : ptxt;

      prompts.push({
        prompt_id: startId,
        timestamp: String(ph.timestamp ?? ''),
        prompt_text,
        turn_count,
        tool_call_count,
        file_edit_count,
        moment_cost: Math.round(moment_cost * 1_000_000) / 1_000_000,
        has_error,
        top_tools,
        tool_type_count: Object.keys(toolFreq).length,
        response_excerpt,
      });
    }

    const response: SessionSummaryResponse = {
      header,
      participants,
      model_breakdown,
      prompts,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Session summary error:', error);
    return NextResponse.json({ error: 'Failed to load session summary' }, { status: 500 });
  }
}
