import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import { calcCost } from '@/lib/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const granularity = searchParams.get('granularity') || 'day'; // 'hour' | 'day'
  const fmt = granularity === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';

  const conditions: string[] = ['(input_tokens IS NOT NULL OR output_tokens IS NOT NULL)'];
  const params: unknown[] = [fmt];
  if (start) { conditions.push('timestamp >= ?'); params.push(start); }
  if (end)   { conditions.push('timestamp < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(end); }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(timestamp, ?) AS time,
        COALESCE(SUM(input_tokens), 0)            AS input_tokens,
        COALESCE(SUM(output_tokens), 0)           AS output_tokens,
        COALESCE(SUM(cache_creation_tokens), 0)   AS cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0)       AS cache_read_tokens,
        COALESCE(SUM(total_tokens), 0)            AS total_tokens
      FROM cc_events
      WHERE ${conditions.join(' AND ')}
      GROUP BY time
      ORDER BY time ASC`,
      params
    );

    const data = rows.map((r) => {
      const i = Number(r.input_tokens);
      const o = Number(r.output_tokens);
      const cw = Number(r.cache_write_tokens);
      const cr = Number(r.cache_read_tokens);
      return {
        time: r.time,
        input_tokens: i,
        output_tokens: o,
        cache_write_tokens: cw,
        cache_read_tokens: cr,
        total_tokens: Number(r.total_tokens),
        cost: calcCost(i, o, cw, cr),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Token timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch token timeline' }, { status: 500 });
  }
}
