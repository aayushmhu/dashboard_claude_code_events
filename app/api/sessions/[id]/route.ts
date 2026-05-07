import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

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
        TIMESTAMPDIFF(SECOND, s.started_at, s.last_seen_at) AS duration_seconds
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
      duration_seconds: Number(session.duration_seconds),
    });
  } catch (error) {
    console.error('Session detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}
