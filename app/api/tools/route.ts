import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET() {
  try {
    const [tools] = await pool.query<RowDataPacket[]>(
      `SELECT
        tool_name,
        COUNT(*) AS total_calls,
        COALESCE(SUM(is_error), 0) AS error_count,
        ROUND(COALESCE(SUM(is_error), 0) / COUNT(*) * 100, 2) AS error_rate,
        COALESCE(AVG(JSON_LENGTH(tool_output)), 0) AS avg_output_size,
        MAX(timestamp) AS last_used,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
        COALESCE(MAX(duration_ms), 0) AS max_duration_ms
      FROM cc_events
      WHERE event_type = 'PostToolUse' AND tool_name IS NOT NULL
      GROUP BY tool_name
      ORDER BY total_calls DESC`
    );

    return NextResponse.json(
      tools.map((t) => ({
        ...t,
        total_calls: Number(t.total_calls),
        error_count: Number(t.error_count),
        error_rate: Number(t.error_rate),
        avg_output_size: Math.round(Number(t.avg_output_size)),
        avg_duration_ms: Math.round(Number(t.avg_duration_ms)),
        max_duration_ms: Math.round(Number(t.max_duration_ms)),
      }))
    );
  } catch (error) {
    console.error('Tools error:', error);
    return NextResponse.json({ error: 'Failed to fetch tools' }, { status: 500 });
  }
}
