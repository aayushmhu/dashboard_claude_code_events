import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET() {
  try {
    const [projects] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.project_dir,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        COUNT(DISTINCT s.session_id) AS total_sessions,
        COUNT(e.id) AS total_events,
        COALESCE(SUM(e.is_error), 0) AS error_count,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
        MAX(e.timestamp) AS last_active
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      WHERE s.project_dir IS NOT NULL AND s.project_dir != ''
      GROUP BY s.project_dir
      ORDER BY last_active DESC`
    );

    // Fetch top tool per project
    const result = await Promise.all(
      projects.map(async (p) => {
        const [[topToolRow]] = await pool.query<RowDataPacket[]>(
          `SELECT tool_name
          FROM cc_events e
          JOIN cc_sessions s ON e.session_id = s.session_id
          WHERE s.project_dir = ? AND e.event_type = 'PostToolUse' AND e.tool_name IS NOT NULL
          GROUP BY tool_name
          ORDER BY COUNT(*) DESC
          LIMIT 1`,
          [p.project_dir]
        );
        return {
          ...p,
          total_sessions: Number(p.total_sessions),
          total_events: Number(p.total_events),
          error_count: Number(p.error_count),
          total_tokens: Number(p.total_tokens),
          top_tool: topToolRow?.tool_name ?? null,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
