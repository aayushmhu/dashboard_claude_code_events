import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const beforeId = searchParams.get('before_id');

  try {
    const conditions: string[] = ['session_id = ?'];
    const queryParams: unknown[] = [id];

    if (beforeId) {
      conditions.push('id < ?');
      queryParams.push(parseInt(beforeId, 10));
    }

    queryParams.push(limit);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        id, session_id, timestamp, event_type, agent, role,
        content, tool_name, tool_input, tool_output,
        is_error, error_message, transcript_path,
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens,
        model,
        json_extract(raw_payload, '$.notification_type') AS notification_type
      FROM cc_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?`,
      queryParams
    );

    const parseJson = (v: unknown) => {
      if (!v || typeof v === 'object') return v ?? null;
      try { return JSON.parse(String(v)); } catch { return null; }
    };

    // Return in chronological order; caller uses has_more to know if older events exist
    const events = [...rows].reverse().map((e) => ({
      ...e,
      is_error: Boolean(e.is_error),
      tool_input:  parseJson(e.tool_input),
      tool_output: parseJson(e.tool_output),
    }));

    return NextResponse.json({ events, has_more: rows.length === limit });
  } catch (error) {
    console.error('Session events error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
