import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET() {
  try {
    const [
      [[sessionRow]],
      [[eventRow]],
      [[projectRow]],
      [entrypointRows],
    ] = await Promise.all([
      pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM cc_sessions'),
      pool.query<RowDataPacket[]>('SELECT COUNT(*) as total, COALESCE(SUM(is_error), 0) as errors FROM cc_events'),
      pool.query<RowDataPacket[]>("SELECT COUNT(DISTINCT project_dir) as count FROM cc_sessions WHERE project_dir IS NOT NULL AND project_dir != ''"),
      pool.query<RowDataPacket[]>(
        `SELECT COALESCE(entrypoint, 'cli') AS entrypoint, COUNT(DISTINCT session_id) AS count
         FROM cc_events
         WHERE event_type = 'Stop'
         GROUP BY entrypoint`
      ),
    ]);

    const errorRate =
      eventRow.total > 0
        ? Math.round((eventRow.errors / eventRow.total) * 10000) / 100
        : 0;

    const entrypointBreakdown = (entrypointRows as RowDataPacket[]).map(r => ({
      entrypoint: r.entrypoint as string,
      count: Number(r.count),
    }));

    return NextResponse.json({
      total_sessions: Number(sessionRow.count),
      total_events: Number(eventRow.total),
      active_projects: Number(projectRow.count),
      error_rate: errorRate,
      entrypoint_breakdown: entrypointBreakdown,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
