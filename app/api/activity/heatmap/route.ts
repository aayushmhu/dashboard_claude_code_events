import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET() {
  const cutoff = new Date(Date.now() - 364 * 86400_000).toISOString().slice(0, 10);
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        strftime('%Y-%m-%d', timestamp) AS day,
        COUNT(*) AS count
      FROM cc_events
      WHERE timestamp >= ?
      GROUP BY day
      ORDER BY day ASC`,
      [cutoff]
    );

    return NextResponse.json(
      rows.map((r) => ({ day: r.day as string, count: Number(r.count) }))
    );
  } catch (error) {
    console.error('Heatmap error:', error);
    return NextResponse.json({ error: 'Failed to fetch heatmap data' }, { status: 500 });
  }
}
