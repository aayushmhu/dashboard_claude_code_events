import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const errorsOnly = searchParams.get('errors_only') === 'true';

  try {
    const conditions = ["e.event_type = 'PostToolUse'", 'e.tool_name = ?'];
    if (errorsOnly) conditions.push('e.is_error = TRUE');

    const [calls] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.id, e.session_id, e.timestamp, e.tool_name,
        e.tool_input, e.tool_output, e.is_error, e.error_message,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name
      FROM cc_events e
      JOIN cc_sessions s ON e.session_id = s.session_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.timestamp DESC
      LIMIT ?`,
      [name, limit]
    );

    const parseJson = (v: unknown) => {
      if (!v || typeof v === 'object') return v ?? null;
      try { return JSON.parse(String(v)); } catch { return null; }
    };

    return NextResponse.json(
      calls.map((c) => ({ ...c, is_error: Boolean(c.is_error), tool_input: parseJson(c.tool_input), tool_output: parseJson(c.tool_output) }))
    );
  } catch (error) {
    console.error('Tool detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch tool calls' }, { status: 500 });
  }
}
