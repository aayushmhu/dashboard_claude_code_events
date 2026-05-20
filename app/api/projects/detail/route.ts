import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// Qualified e.model — cc_sessions also has a model column, JOIN would be ambiguous otherwise.
const COST_EXPR = `
  CASE WHEN e.model LIKE '%opus%' THEN
    (e.input_tokens * 5.0 + e.output_tokens * 25.0 + e.cache_creation_tokens * 10.0 + e.cache_read_tokens * 0.50) / 1000000.0
  WHEN e.model LIKE '%haiku%' THEN
    (e.input_tokens * 1.0 + e.output_tokens * 5.0 + e.cache_creation_tokens * 2.0 + e.cache_read_tokens * 0.10) / 1000000.0
  ELSE
    (e.input_tokens * 3.0 + e.output_tokens * 15.0 + e.cache_creation_tokens * 6.0 + e.cache_read_tokens * 0.30) / 1000000.0
  END
`;

export interface ProjectDetailHeader {
  project_dir: string;
  project_name: string;
  total_sessions: number;
  total_events: number;
  total_tokens: number;
  total_cost: number;
  error_count: number;
  first_seen: string | null;
  last_seen: string | null;
  user_turns: number;
}

export interface ProjectDetailTopTool {
  tool_name: string;
  call_count: number;
  error_count: number;
}

export interface ProjectDetailAgentActivity {
  agent_name: string;
  dispatch_count: number;
  total_tokens: number;
  cost: number;
}

export interface ProjectDetailCostBreakdown {
  model_family: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface ProjectDetailErrorSummary {
  tool_name: string | null;
  message: string;
  occurrences: number;
  last_seen: string;
  session_id: string | null;
}

export interface ProjectDetailCostTimelinePoint {
  date: string;
  cost: number;
}

export interface ProjectDetailResponse {
  header: ProjectDetailHeader;
  top_tools: ProjectDetailTopTool[];
  agent_activity: ProjectDetailAgentActivity[];
  cost_breakdown: ProjectDetailCostBreakdown[];
  error_summary: ProjectDetailErrorSummary[];
  cost_timeline: ProjectDetailCostTimelinePoint[];
}

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get('project');
  if (!project) return NextResponse.json({ error: 'project param required' }, { status: 400 });

  try {
    const [[headerRow]] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.project_dir,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        COUNT(DISTINCT s.session_id) AS total_sessions,
        COUNT(e.id) AS total_events,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
        ROUND(COALESCE(SUM(CASE WHEN e.event_type IN ('Stop','SubagentStop') THEN (${COST_EXPR}) ELSE 0 END), 0), 6) AS total_cost,
        COALESCE(SUM(e.is_error), 0) AS error_count,
        MIN(e.timestamp) AS first_seen,
        MAX(e.timestamp) AS last_seen
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      WHERE s.project_dir = ?
      GROUP BY s.project_dir`,
      [project]
    );
    if (!headerRow) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const [[userTurnsRow]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS user_turns
       FROM cc_events e
       JOIN cc_sessions s ON e.session_id = s.session_id
       WHERE s.project_dir = ? AND e.event_type = 'UserPromptSubmit'`,
      [project]
    );

    const header: ProjectDetailHeader = {
      project_dir: String(headerRow.project_dir ?? ''),
      project_name: String(headerRow.project_name ?? ''),
      total_sessions: Number(headerRow.total_sessions ?? 0),
      total_events: Number(headerRow.total_events ?? 0),
      total_tokens: Number(headerRow.total_tokens ?? 0),
      total_cost: Number(headerRow.total_cost ?? 0),
      error_count: Number(headerRow.error_count ?? 0),
      first_seen: headerRow.first_seen ? String(headerRow.first_seen) : null,
      last_seen: headerRow.last_seen ? String(headerRow.last_seen) : null,
      user_turns: Number(userTurnsRow?.user_turns ?? 0),
    };

    const [toolRows] = await pool.query<RowDataPacket[]>(
      `SELECT e.tool_name, COUNT(*) AS call_count, COALESCE(SUM(e.is_error), 0) AS error_count
       FROM cc_events e
       JOIN cc_sessions s ON e.session_id = s.session_id
       WHERE s.project_dir = ? AND e.event_type = 'PostToolUse' AND e.tool_name IS NOT NULL
       GROUP BY e.tool_name ORDER BY call_count DESC LIMIT 10`,
      [project]
    );
    const top_tools: ProjectDetailTopTool[] = toolRows.map((r) => ({
      tool_name: String(r.tool_name),
      call_count: Number(r.call_count ?? 0),
      error_count: Number(r.error_count ?? 0),
    }));

    const [agentRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(NULLIF(json_extract(e.raw_payload, '$.agent_type'), ''), e.agent) AS agent_name,
        COUNT(*) AS dispatch_count,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
        ROUND(SUM(${COST_EXPR}), 6) AS cost
       FROM cc_events e
       JOIN cc_sessions s ON e.session_id = s.session_id
       WHERE s.project_dir = ? AND e.event_type = 'SubagentStop'
       GROUP BY agent_name ORDER BY cost DESC LIMIT 8`,
      [project]
    );
    const agent_activity: ProjectDetailAgentActivity[] = agentRows.map((r) => ({
      agent_name: String(r.agent_name ?? 'subagent'),
      dispatch_count: Number(r.dispatch_count ?? 0),
      total_tokens: Number(r.total_tokens ?? 0),
      cost: Number(r.cost ?? 0),
    }));

    const [breakdownRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        CASE WHEN e.model LIKE '%opus%' THEN 'opus'
             WHEN e.model LIKE '%haiku%' THEN 'haiku'
             ELSE 'sonnet'
        END AS model_family,
        COALESCE(SUM(e.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(e.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(e.cache_creation_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(e.cache_read_tokens), 0) AS cache_read_tokens,
        ROUND(SUM(${COST_EXPR}), 6) AS cost
       FROM cc_events e
       JOIN cc_sessions s ON e.session_id = s.session_id
       WHERE s.project_dir = ? AND e.event_type IN ('Stop','SubagentStop')
       GROUP BY model_family ORDER BY cost DESC`,
      [project]
    );
    const cost_breakdown: ProjectDetailCostBreakdown[] = breakdownRows.map((r) => ({
      model_family: String(r.model_family ?? 'sonnet'),
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
      cache_write_tokens: Number(r.cache_write_tokens ?? 0),
      cache_read_tokens: Number(r.cache_read_tokens ?? 0),
      cost: Number(r.cost ?? 0),
    }));

    const [errorRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.tool_name,
        COALESCE(e.error_message, e.content, 'Unknown error') AS message,
        COUNT(*) AS occurrences,
        MAX(e.timestamp) AS last_seen,
        e.session_id
       FROM cc_events e
       JOIN cc_sessions s ON e.session_id = s.session_id
       WHERE s.project_dir = ? AND e.is_error = 1
       GROUP BY message, e.tool_name, e.session_id
       ORDER BY last_seen DESC LIMIT 10`,
      [project]
    );
    const error_summary: ProjectDetailErrorSummary[] = errorRows.map((r) => ({
      tool_name: r.tool_name ? String(r.tool_name) : null,
      message: String(r.message ?? 'Unknown error').slice(0, 200),
      occurrences: Number(r.occurrences ?? 0),
      last_seen: String(r.last_seen ?? ''),
      session_id: r.session_id ? String(r.session_id) : null,
    }));

    const cost_scope = request.nextUrl.searchParams.get('cost_scope') ?? '30d';
    const scopeFilter: Record<string, string> = {
      '7d':  `AND date(e.timestamp) >= date('now', '-6 days')`,
      '30d': `AND date(e.timestamp) >= date('now', '-29 days')`,
      '90d': `AND date(e.timestamp) >= date('now', '-89 days')`,
      'all': '',
    };
    const dateClause = scopeFilter[cost_scope] ?? scopeFilter['30d'];

    const [timelineRows] = await pool.query<RowDataPacket[]>(
      `SELECT date(e.timestamp) AS date, ROUND(SUM(${COST_EXPR}), 6) AS cost
       FROM cc_events e JOIN cc_sessions s ON e.session_id = s.session_id
       WHERE s.project_dir = ? AND e.event_type IN ('Stop','SubagentStop') ${dateClause}
       GROUP BY date(e.timestamp) ORDER BY date(e.timestamp) ASC`,
      [project]
    );
    const cost_timeline: ProjectDetailCostTimelinePoint[] = timelineRows.map((r) => ({
      date: String(r.date),
      cost: Number(r.cost ?? 0),
    }));

    return NextResponse.json({
      header, top_tools, agent_activity, cost_breakdown, error_summary, cost_timeline,
    } satisfies ProjectDetailResponse);
  } catch (error) {
    console.error('Project detail error:', error);
    return NextResponse.json({ error: 'Failed to load project detail' }, { status: 500 });
  }
}
