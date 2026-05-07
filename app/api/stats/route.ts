import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const [[sessionRow]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM cc_sessions'
    );
    const [[eventRow]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total, COALESCE(SUM(is_error), 0) as errors FROM cc_events'
    );
    const [[projectRow]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(DISTINCT project_dir) as count FROM cc_sessions WHERE project_dir IS NOT NULL AND project_dir != ""'
    );

    const errorRate =
      eventRow.total > 0
        ? Math.round((eventRow.errors / eventRow.total) * 10000) / 100
        : 0;

    return NextResponse.json({
      total_sessions: Number(sessionRow.count),
      total_events: Number(eventRow.total),
      active_projects: Number(projectRow.count),
      error_rate: errorRate,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
