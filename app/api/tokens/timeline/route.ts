import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// Per-row cost SQL — mixed models per time bucket, so computed in SQL
const COST_SQL = `(CASE
  WHEN model LIKE '%opus%' THEN
    COALESCE(input_tokens,0)*5/1e6 + COALESCE(output_tokens,0)*25/1e6 +
    COALESCE(cache_creation_tokens,0)*10/1e6 + COALESCE(cache_read_tokens,0)*0.5/1e6
  WHEN model LIKE '%haiku%' THEN
    COALESCE(input_tokens,0)*1/1e6 + COALESCE(output_tokens,0)*5/1e6 +
    COALESCE(cache_creation_tokens,0)*2/1e6 + COALESCE(cache_read_tokens,0)*0.1/1e6
  ELSE
    COALESCE(input_tokens,0)*3/1e6 + COALESCE(output_tokens,0)*15/1e6 +
    COALESCE(cache_creation_tokens,0)*6/1e6 + COALESCE(cache_read_tokens,0)*0.3/1e6
END)`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const granularity = searchParams.get('granularity') || 'day';
  const fmt = granularity === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';

  const conditions: string[] = ['(input_tokens IS NOT NULL OR output_tokens IS NOT NULL)'];
  const params: unknown[] = [fmt];
  if (start) { conditions.push('timestamp >= ?'); params.push(start); }
  if (end)   { conditions.push("timestamp < datetime(?, '+1 day')"); params.push(end); }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        strftime(?, timestamp)                 AS time,
        COALESCE(SUM(input_tokens), 0)         AS input_tokens,
        COALESCE(SUM(output_tokens), 0)        AS output_tokens,
        COALESCE(SUM(cache_creation_tokens),0) AS cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0)    AS cache_read_tokens,
        COALESCE(SUM(total_tokens), 0)         AS total_tokens,
        COALESCE(SUM(${COST_SQL}), 0)          AS cost
      FROM cc_events
      WHERE ${conditions.join(' AND ')}
      GROUP BY time
      ORDER BY time ASC`,
      params
    );

    const data = rows.map((r) => ({
      time:               r.time,
      input_tokens:       Number(r.input_tokens),
      output_tokens:      Number(r.output_tokens),
      cache_write_tokens: Number(r.cache_write_tokens),
      cache_read_tokens:  Number(r.cache_read_tokens),
      total_tokens:       Number(r.total_tokens),
      cost:               Number(r.cost),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Token timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch token timeline' }, { status: 500 });
  }
}
