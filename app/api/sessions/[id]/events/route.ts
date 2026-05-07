import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT
        id, session_id, timestamp, event_type, agent, role,
        content, tool_name, tool_input, tool_output,
        is_error, error_message, raw_payload, transcript_path
      FROM cc_events
      WHERE session_id = ?
      ORDER BY id ASC`,
      [id]
    );

    return NextResponse.json(
      events.map((e) => ({
        ...e,
        is_error: Boolean(e.is_error),
      }))
    );
  } catch (error) {
    console.error('Session events error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
