import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const [[session]] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.*,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        COUNT(e.id) AS event_count,
        COALESCE(SUM(e.is_error), 0) AS error_count,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
        TIMESTAMPDIFF('SECOND', s.started_at, s.last_seen_at) AS duration_seconds,
        MAX(CASE WHEN e.event_type IN ('Stop', 'SubagentStop') AND e.entrypoint IS NOT NULL THEN e.entrypoint ELSE NULL END) AS entrypoint,
        MAX(CASE WHEN e.event_type IN ('Stop', 'SubagentStop') AND e.git_branch IS NOT NULL THEN e.git_branch ELSE NULL END) AS git_branch,
        (SELECT COUNT(*) FROM cc_transcript_records t WHERE t.session_id = s.session_id AND t.record_subtype = 'thinking') AS thinking_count,
        (SELECT COUNT(*) FROM cc_transcript_records t WHERE t.session_id = s.session_id AND t.record_subtype IN ('image', 'document')) AS image_count
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      WHERE s.session_id = ?
      GROUP BY s.session_id`,
      [id]
    );

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...session,
      event_count: Number(session.event_count),
      error_count: Number(session.error_count),
      total_tokens: Number(session.total_tokens),
      duration_seconds: Number(session.duration_seconds),
      entrypoint: session.entrypoint ?? null,
      git_branch: session.git_branch ?? null,
      thinking_count: Number(session.thinking_count),
      image_count: Number(session.image_count),
    });
  } catch (error) {
    console.error('Session detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}
