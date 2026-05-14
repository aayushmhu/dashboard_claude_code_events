import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const grouped = searchParams.get('grouped') !== 'false';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const offset = (page - 1) * limit;

  try {
    if (grouped) {
      // Tool errors — from cc_events.is_error
      const [toolGroups] = await pool.query<RowDataPacket[]>(
        `SELECT
          COALESCE(e.error_message, e.content, 'Unknown error') AS message,
          e.tool_name,
          COUNT(*) AS occurrences,
          COUNT(DISTINCT e.session_id) AS session_count,
          MAX(e.timestamp) AS last_seen
        FROM cc_events e
        WHERE e.is_error = TRUE
        GROUP BY message, e.tool_name
        ORDER BY last_seen DESC
        LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const [[{ tool_total }]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as tool_total FROM (
          SELECT 1 FROM cc_events
          WHERE is_error = TRUE
          GROUP BY COALESCE(error_message, content, 'Unknown error'), tool_name
        ) g`
      );

      // API errors — from cc_transcript_records where subtype='api_error'.
      // content_text is a JSON blob with cause.code (e.g. 'ConnectionRefused')
      // and cause.path (the Anthropic API URL that failed).
      const [apiGroups] = await pool.query<RowDataPacket[]>(
        `SELECT
          COALESCE(json_extract(content_text, '$.cause.code'),
                   json_extract(content_text, '$.type'),
                   'Unknown API error') AS code,
          json_extract(content_text, '$.cause.path') AS url_path,
          COUNT(*) AS occurrences,
          COUNT(DISTINCT session_id) AS session_count,
          MAX(timestamp) AS last_seen
        FROM cc_transcript_records
        WHERE record_type = 'system'
          AND record_subtype = 'api_error'
        GROUP BY code, url_path
        ORDER BY last_seen DESC
        LIMIT 50`
      );

      const [[{ api_total }]] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS api_total FROM (
          SELECT 1 FROM cc_transcript_records
          WHERE record_type='system' AND record_subtype='api_error'
          GROUP BY json_extract(content_text, '$.cause.code'),
                   json_extract(content_text, '$.cause.path')
        ) g`
      );

      return NextResponse.json({
        // Tool errors (existing shape preserved for backward compat — `groups` aliased)
        tool_groups: toolGroups,
        tool_total: Number(tool_total),
        api_groups: apiGroups,
        api_total: Number(api_total),
        // Legacy aliases (old clients of /api/errors still work)
        groups: toolGroups,
        total: Number(tool_total),
        page,
        limit,
        total_pages: Math.ceil(Number(tool_total) / limit),
      });
    }

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
