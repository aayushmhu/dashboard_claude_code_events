import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get('project') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limitParam = searchParams.get('limit') || '20';
  const limit = limitParam === 'all' ? 10000 : Math.min(10000, parseInt(limitParam));
  const hasErrors = searchParams.get('has_errors') === 'true';
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';
  const offset = (page - 1) * (limitParam === 'all' ? 0 : limit);

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (project) {
      conditions.push('s.project_dir LIKE ?');
      params.push(`%${project}%`);
    }
    if (start) {
      conditions.push('s.started_at >= ?');
      params.push(start);
    }
    if (end) {
      conditions.push("s.started_at < datetime(?, '+1 day')");
      params.push(end);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const havingClause = hasErrors ? 'HAVING error_count > 0' : '';

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.session_id,
        s.started_at,
        s.last_seen_at,
        s.cwd,
        s.project_dir,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        COUNT(e.id) AS event_count,
        COALESCE(SUM(e.is_error), 0) AS error_count,
        TIMESTAMPDIFF('SECOND', s.started_at, s.last_seen_at) AS duration_seconds,
        GROUP_CONCAT(DISTINCT e.tool_name) AS tools_used_raw,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
        COALESCE(SUM(e.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(e.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(e.cache_creation_tokens), 0) AS cache_creation_tokens,
        COALESCE(SUM(e.cache_read_tokens), 0) AS cache_read_tokens,
        s.model,
        GROUP_CONCAT(DISTINCT e.model) AS models_used_raw,
        MAX(CASE WHEN e.event_type IN ('Stop', 'SubagentStop') AND e.entrypoint IS NOT NULL THEN e.entrypoint ELSE NULL END) AS entrypoint,
        MAX(CASE WHEN e.event_type IN ('Stop', 'SubagentStop') AND e.git_branch IS NOT NULL THEN e.git_branch ELSE NULL END) AS git_branch,
        (SELECT COUNT(*) FROM cc_transcript_records t WHERE t.session_id = s.session_id AND t.record_subtype = 'thinking') AS thinking_count,
        (SELECT COUNT(*) FROM cc_transcript_records t WHERE t.session_id = s.session_id AND t.record_subtype IN ('image', 'document')) AS image_count
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      ${whereClause}
      GROUP BY s.session_id
      ${havingClause}
      ORDER BY s.last_seen_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT s.session_id) as total
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      ${whereClause}`,
      params
    );

    const sessions = rows.map((r) => ({
      ...r,
      event_count: Number(r.event_count),
      error_count: Number(r.error_count),
      duration_seconds: Number(r.duration_seconds),
      total_tokens: Number(r.total_tokens),
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
      cache_creation_tokens: Number(r.cache_creation_tokens),
      cache_read_tokens: Number(r.cache_read_tokens),
      model: r.model ?? null,
      models_used: r.models_used_raw
        ? r.models_used_raw.split(',').filter(Boolean)
        : [],
      entrypoint: r.entrypoint ?? null,
      git_branch: r.git_branch ?? null,
      thinking_count: Number(r.thinking_count),
      image_count: Number(r.image_count),
      tools_used: r.tools_used_raw
        ? r.tools_used_raw.split(',').filter(Boolean)
        : [],
    }));

    return NextResponse.json({
      sessions,
      total: Number(total),
      page,
      limit,
      total_pages: Math.ceil(Number(total) / limit),
    });
  } catch (error) {
    console.error('Sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
