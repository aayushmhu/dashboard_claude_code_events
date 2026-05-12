import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '20'));
  const offset = (page - 1) * limit;

  try {
    const [errors] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.id, e.session_id, e.timestamp, e.event_type,
        e.tool_name, e.error_message, e.content,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        s.project_dir
      FROM cc_events e
      JOIN cc_sessions s ON e.session_id = s.session_id
      WHERE e.is_error = TRUE
      ORDER BY e.timestamp DESC
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total }]] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM cc_events WHERE is_error = TRUE'
    );

    return NextResponse.json({
      errors,
      total: Number(total),
      page,
      limit,
      total_pages: Math.ceil(Number(total) / limit),
    });
  } catch (error) {
    console.error('Errors error:', error);
    return NextResponse.json({ error: 'Failed to fetch errors' }, { status: 500 });
  }
}
