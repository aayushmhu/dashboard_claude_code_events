import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

const EVENT_SELECT = `
  id, session_id, timestamp, event_type, agent, role,
  COALESCE(NULLIF(json_extract(raw_payload, '$.agent_type'), ''), agent) AS agent_type,
  content, tool_name, tool_input, tool_output,
  is_error, error_message, transcript_path,
  input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens,
  model,
  json_extract(raw_payload, '$.notification_type') AS notification_type
`;

const parseJson = (v: unknown) => {
  if (!v || typeof v === 'object') return v ?? null;
  try { return JSON.parse(String(v)); } catch { return null; }
};

function mapRow(e: RowDataPacket) {
  return {
    ...e,
    is_error: Boolean(e.is_error),
    tool_input: parseJson(e.tool_input),
    tool_output: parseJson(e.tool_output),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const beforeId = searchParams.get('before_id');
  const afterId  = searchParams.get('after_id');
  const focusId  = searchParams.get('focus_id');

  try {
    // ── focus_id: 25 before + 25 after ────────────────────────────────────────
    if (focusId) {
      const fid = parseInt(focusId, 10);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (
          SELECT ${EVENT_SELECT} FROM cc_events
          WHERE session_id = ? AND id <= ?
          ORDER BY id DESC LIMIT 25
        )
        UNION ALL
        SELECT * FROM (
          SELECT ${EVENT_SELECT} FROM cc_events
          WHERE session_id = ? AND id > ?
          ORDER BY id ASC LIMIT 25
        )
        ORDER BY id ASC`,
        [id, fid, id, fid]
      );
      const rawIds = (rows as RowDataPacket[]).map((r) => r.id as number);
      const events = (rows as RowDataPacket[]).map(mapRow);
      const oldestId = rawIds.length > 0 ? Math.min(...rawIds) : null;
      const newestId = rawIds.length > 0 ? Math.max(...rawIds) : null;
      // has_more_older: true if there may be older events above this slice
      // has_more_newer: true if there may be newer events below this slice
      const hasMoreOlder = rawIds.filter((i) => i <= fid).length >= 25;
      const hasMoreNewer = rawIds.filter((i) => i > fid).length >= 25;
      return NextResponse.json({
        events,
        has_more: hasMoreOlder,
        has_more_older: hasMoreOlder,
        has_more_newer: hasMoreNewer,
        oldest_id: oldestId,
        newest_id: newestId,
      });
    }

    // ── after_id: newer events ────────────────────────────────────────────────
    if (afterId) {
      const aid = parseInt(afterId, 10);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ${EVENT_SELECT} FROM cc_events
        WHERE session_id = ? AND id > ?
        ORDER BY id ASC
        LIMIT ?`,
        [id, aid, limit]
      );
      const events = (rows as RowDataPacket[]).map(mapRow);
      return NextResponse.json({
        events,
        has_more: false,
        has_more_older: true,
        has_more_newer: events.length === limit,
      });
    }

    // ── before_id / latest: existing behavior ────────────────────────────────
    const conditions: string[] = ['session_id = ?'];
    const queryParams: unknown[] = [id];

    if (beforeId) {
      conditions.push('id < ?');
      queryParams.push(parseInt(beforeId, 10));
    }

    queryParams.push(limit);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${EVENT_SELECT}
      FROM cc_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?`,
      queryParams
    );

    // Return in chronological order; caller uses has_more to know if older events exist
    const events = [...(rows as RowDataPacket[])].reverse().map(mapRow);

    return NextResponse.json({
      events,
      has_more: rows.length === limit,
      has_more_older: rows.length === limit,
      has_more_newer: false,
    });
  } catch (error) {
    console.error('Session events error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
