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

export interface SessionSummaryMoment {
  event_id: number;
  timestamp: string;
  moment_type:
    | 'user_prompt'
    | 'subagent_dispatch'
    | 'ask_user'
    | 'high_cost'
    | 'error'
    | 'final_outcome';
  content_snippet: string | null;
  agent_value: string | null;
  agent_type: string | null;
  error_message: string | null;
  tool_name: string | null;
  cost: number | null;
  /** For ask_user moments: the content of the next UserPromptSubmit event (user's answer). */
  ask_user_answer: string | null;
}

export interface SessionSummaryModelBreakdown {
  model_family: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface SessionSummaryResponse {
  header: SessionSummaryHeader;
  participants: SessionSummaryParticipants;
  key_moments: SessionSummaryMoment[];
  model_breakdown: SessionSummaryModelBreakdown[];
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

    // ── Slice 3: Key moments (UNION ALL, max 20 entries) ──────────────────
    // Each branch of the UNION uses the same column order. Rows may overlap
    // (e.g., a SubagentStop that is also high-cost appears in both branches)
    // which is intentional — the UI can show both badges on one timeline entry
    // if it dedupes by event_id + moment_type.
    const [momentRows] = await pool.query<RowDataPacket[]>(
      `SELECT event_id, timestamp, moment_type, content_snippet, agent_value, agent_type, error_message, tool_name, cost
      FROM (
        SELECT
          id AS event_id,
          timestamp,
          'user_prompt' AS moment_type,
          SUBSTR(content, 1, 200) AS content_snippet,
          agent AS agent_value,
          NULL AS agent_type,
          NULL AS error_message,
          NULL AS tool_name,
          NULL AS cost
        FROM cc_events
        WHERE session_id = ? AND event_type = 'UserPromptSubmit'

        UNION ALL

        SELECT
          id AS event_id,
          timestamp,
          'subagent_dispatch' AS moment_type,
          NULL AS content_snippet,
          agent AS agent_value,
          COALESCE(NULLIF(json_extract(raw_payload, '$.agent_type'), ''), agent) AS agent_type,
          NULL AS error_message,
          NULL AS tool_name,
          NULL AS cost
        FROM cc_events
        WHERE session_id = ? AND event_type = 'SubagentStop' AND agent <> 'main'

        UNION ALL

        SELECT
          id AS event_id,
          timestamp,
          'ask_user' AS moment_type,
          SUBSTR(tool_input, 1, 200) AS content_snippet,
          agent AS agent_value,
          NULL AS agent_type,
          NULL AS error_message,
          tool_name,
          NULL AS cost
        FROM cc_events
        WHERE session_id = ? AND event_type = 'PreToolUse' AND tool_name = 'AskUserQuestion'

        UNION ALL

        SELECT
          id AS event_id,
          timestamp,
          'high_cost' AS moment_type,
          NULL AS content_snippet,
          agent AS agent_value,
          NULL AS agent_type,
          NULL AS error_message,
          NULL AS tool_name,
          ROUND(${COST_EXPR}, 6) AS cost
        FROM cc_events
        WHERE session_id = ?
          AND event_type IN ('Stop', 'SubagentStop')
          AND (${COST_EXPR}) > 0.50

        UNION ALL

        SELECT
          id AS event_id,
          timestamp,
          'error' AS moment_type,
          NULL AS content_snippet,
          agent AS agent_value,
          NULL AS agent_type,
          error_message,
          tool_name,
          NULL AS cost
        FROM cc_events
        WHERE session_id = ? AND is_error = 1

        UNION ALL

        SELECT
          id AS event_id,
          timestamp,
          'final_outcome' AS moment_type,
          NULL AS content_snippet,
          agent AS agent_value,
          NULL AS agent_type,
          NULL AS error_message,
          NULL AS tool_name,
          NULL AS cost
        FROM cc_events
        WHERE session_id = ?
          AND event_type = 'Stop'
          AND id = (
            SELECT MAX(id) FROM cc_events
            WHERE session_id = ? AND event_type = 'Stop'
          )
      ) moments
      ORDER BY timestamp ASC
      LIMIT 50`,
      [id, id, id, id, id, id, id]
    );

    // ── Fetch AskUserQuestion paired answers (next UserPromptSubmit per ask event) ──
    // Build a map from ask_event_id -> answer content
    const askEventIds = momentRows
      .filter((r) => String(r.moment_type) === 'ask_user')
      .map((r) => Number(r.event_id));

    const askAnswerMap = new Map<number, string>();
    if (askEventIds.length > 0) {
      // For each AskUserQuestion event, find the next UserPromptSubmit in the same session
      const [answerRows] = await pool.query<RowDataPacket[]>(
        `SELECT a_id, content FROM (
          SELECT ask_ev.id AS a_id,
                 ans.content,
                 ROW_NUMBER() OVER (PARTITION BY ask_ev.id ORDER BY ans.id ASC) AS rn
          FROM cc_events ask_ev
          JOIN cc_events ans ON (
            ans.session_id = ask_ev.session_id
            AND ans.event_type = 'UserPromptSubmit'
            AND ans.id > ask_ev.id
          )
          WHERE ask_ev.id IN (${askEventIds.map(() => '?').join(',')})
        ) ranked
        WHERE rn = 1`,
        askEventIds
      );
      for (const row of answerRows) {
        askAnswerMap.set(Number(row.a_id), String(row.content ?? ''));
      }
    }

    // Prune to 5–20 entries: keep all user_prompt and final_outcome,
    // then fill remaining slots with other types.
    const allMoments = momentRows.map((r) => {
      const eid = Number(r.event_id);
      const mtype = String(r.moment_type) as SessionSummaryMoment['moment_type'];
      return {
        event_id: eid,
        timestamp: String(r.timestamp ?? ''),
        moment_type: mtype,
        content_snippet: r.content_snippet ? String(r.content_snippet) : null,
        agent_value: r.agent_value ? String(r.agent_value) : null,
        agent_type: r.agent_type ? String(r.agent_type) : null,
        error_message: r.error_message ? String(r.error_message) : null,
        tool_name: r.tool_name ? String(r.tool_name) : null,
        cost: r.cost != null ? Number(r.cost) : null,
        ask_user_answer: mtype === 'ask_user' ? (askAnswerMap.get(eid) ?? null) : null,
      };
    });

    // Dedupe by event_id+moment_type to avoid exact duplicates, then prune to 20
    const seen = new Set<string>();
    const deduped = allMoments.filter((m) => {
      const key = `${m.event_id}:${m.moment_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const key_moments = deduped.slice(0, 20);

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

    const response: SessionSummaryResponse = {
      header,
      participants,
      key_moments,
      model_breakdown,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Session summary error:', error);
    return NextResponse.json({ error: 'Failed to load session summary' }, { status: 500 });
  }
}
