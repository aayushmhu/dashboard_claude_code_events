import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

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
      conditions.push('s.started_at < DATE_ADD(?, INTERVAL 1 DAY)');
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
        TIMESTAMPDIFF(SECOND, s.started_at, s.last_seen_at) AS duration_seconds,
        GROUP_CONCAT(DISTINCT e.tool_name ORDER BY e.tool_name SEPARATOR ',') AS tools_used_raw,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      ${whereClause}
      GROUP BY s.session_id
      ${havingClause}
      ORDER BY s.started_at DESC
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
