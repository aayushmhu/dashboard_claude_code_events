import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

export async function GET() {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        agent,
        NULL AS agent_type,
        COUNT(*) AS event_count
      FROM cc_events
      WHERE agent = 'main'
      GROUP BY agent

      UNION ALL

      SELECT
        agent,
        COALESCE(NULLIF(json_extract(raw_payload, '$.agent_type'), ''), agent) AS agent_type,
        COUNT(*) AS event_count
      FROM cc_events
      WHERE agent IS NOT NULL AND agent != 'main'
      GROUP BY agent, agent_type
      ORDER BY event_count DESC`
    );

    return NextResponse.json(
      rows.map((r) => ({ ...r, event_count: Number(r.event_count) }))
    );
  } catch (error) {
    console.error('Agents error:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}
