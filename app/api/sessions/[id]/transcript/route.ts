import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// GET /api/sessions/[id]/transcript?types=thinking,image,document,rejection,permission-mode,api_error
// Returns filtered cc_transcript_records for a session, ordered by record_index.
// content_image is returned as a UTF-8 string (it was stored as base64 bytes).
// Pass ?limit=N&offset=N for pagination (default: all).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const typesParam = searchParams.get('types') || '';

  // Build type-filter conditions
  const subtypes: string[] = [];
  const recordTypes: string[] = [];
  if (typesParam) {
    for (const t of typesParam.split(',').map(s => s.trim()).filter(Boolean)) {
      if (t === 'permission-mode') {
        recordTypes.push('permission-mode');
      } else {
        subtypes.push(t);
      }
    }
  }

  const conditions: string[] = ['session_id = ?'];
  const queryParams: unknown[] = [id];

  if (subtypes.length > 0 || recordTypes.length > 0) {
    const inner: string[] = [];
    if (subtypes.length > 0) {
      inner.push(`record_subtype IN (${subtypes.map(() => '?').join(',')})`);
      queryParams.push(...subtypes);
    }
    if (recordTypes.length > 0) {
      inner.push(`record_type IN (${recordTypes.map(() => '?').join(',')})`);
      queryParams.push(...recordTypes);
    }
    conditions.push(`(${inner.join(' OR ')})`);
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        id, session_id, record_index, record_type, record_subtype,
        parent_uuid, uuid, timestamp,
        content_text, image_media_type, content_image,
        model, entrypoint, git_branch, permission_mode, stop_reason,
        is_sidechain, input_tokens, output_tokens,
        cache_creation_tokens, cache_read_tokens,
        is_rejection, is_error
      FROM cc_transcript_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY record_index ASC`,
      queryParams
    );

    const records = rows.map(r => ({
      ...r,
      // content_image is stored as UTF-8 bytes (base64 string) in LONGBLOB
      content_image:
        (r.record_subtype === 'image' || r.record_subtype === 'document')
          ? (Buffer.isBuffer(r.content_image) ? r.content_image.toString('utf8') : (r.content_image ?? null))
          : null,
      is_sidechain: Boolean(r.is_sidechain),
      is_rejection: Boolean(r.is_rejection),
      is_error: Boolean(r.is_error),
    }));

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Transcript fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 });
  }
}
