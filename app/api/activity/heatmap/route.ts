import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(timestamp, '%Y-%m-%d') AS day,
        COUNT(*) AS count
      FROM cc_events
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 364 DAY)
      GROUP BY day
      ORDER BY day ASC`
    );

    return NextResponse.json(
      rows.map((r) => ({ day: r.day as string, count: Number(r.count) }))
    );
  } catch (error) {
    console.error('Heatmap error:', error);
    return NextResponse.json({ error: 'Failed to fetch heatmap data' }, { status: 500 });
  }
}
