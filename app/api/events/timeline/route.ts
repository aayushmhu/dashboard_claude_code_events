import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') || '7'), 90);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') as time,
        event_type,
        COUNT(*) as count
      FROM cc_events
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY time, event_type
      ORDER BY time ASC`,
      [days]
    );

    // Pivot into { time, EventType1: n, EventType2: n, ... }
    const byTime = new Map<string, Record<string, string | number>>();
    for (const row of rows) {
      if (!byTime.has(row.time)) byTime.set(row.time, { time: row.time });
      byTime.get(row.time)![row.event_type] = Number(row.count);
    }

    return NextResponse.json(Array.from(byTime.values()));
  } catch (error) {
    console.error('Timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}
