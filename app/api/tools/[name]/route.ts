import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));

  try {
    const [calls] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.id, e.session_id, e.timestamp, e.tool_name,
        e.tool_input, e.tool_output, e.is_error, e.error_message,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name
      FROM cc_events e
      JOIN cc_sessions s ON e.session_id = s.session_id
      WHERE e.event_type = 'PostToolUse' AND e.tool_name = ?
      ORDER BY e.timestamp DESC
      LIMIT ?`,
      [name, limit]
    );

    return NextResponse.json(
      calls.map((c) => ({ ...c, is_error: Boolean(c.is_error) }))
    );
  } catch (error) {
    console.error('Tool detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch tool calls' }, { status: 500 });
  }
}
