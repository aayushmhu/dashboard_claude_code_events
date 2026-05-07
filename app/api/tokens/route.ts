import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import { calcCost } from '@/lib/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start') || '';
  const end = searchParams.get('end') || '';

  const dateConditions: string[] = ['(input_tokens IS NOT NULL OR output_tokens IS NOT NULL)'];
  const dateParams: unknown[] = [];
  if (start) { dateConditions.push('timestamp >= ?'); dateParams.push(start); }
  if (end)   { dateConditions.push('timestamp < DATE_ADD(?, INTERVAL 1 DAY)'); dateParams.push(end); }
  const whereClause = `WHERE ${dateConditions.join(' AND ')}`;

  try {
    const [[totalsRow]] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(input_tokens), 0)            AS input_tokens,
        COALESCE(SUM(output_tokens), 0)           AS output_tokens,
        COALESCE(SUM(cache_creation_tokens), 0)   AS cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0)       AS cache_read_tokens,
        COALESCE(SUM(total_tokens), 0)            AS total_tokens,
        MIN(timestamp)                            AS first_event_at,
        MAX(timestamp)                            AS last_event_at
      FROM cc_events
      ${whereClause}`,
      dateParams
    );

    const inp  = Number(totalsRow.input_tokens);
    const out  = Number(totalsRow.output_tokens);
    const cw   = Number(totalsRow.cache_write_tokens);
    const cr   = Number(totalsRow.cache_read_tokens);
    const tot  = Number(totalsRow.total_tokens);
    const cost = calcCost(inp, out, cw, cr);
    const cacheEfficiency = (inp + cr) > 0 ? (cr / (inp + cr)) * 100 : 0;

    const projectDateConditions = ['(e.input_tokens IS NOT NULL OR e.output_tokens IS NOT NULL)'];
    const projectDateParams: unknown[] = [];
    if (start) { projectDateConditions.push('e.timestamp >= ?'); projectDateParams.push(start); }
    if (end)   { projectDateConditions.push('e.timestamp < DATE_ADD(?, INTERVAL 1 DAY)'); projectDateParams.push(end); }

    const [byProject] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.project_dir,
        SUBSTRING_INDEX(s.project_dir, '/', -1)  AS project_name,
        COALESCE(SUM(e.input_tokens), 0)          AS input_tokens,
        COALESCE(SUM(e.output_tokens), 0)         AS output_tokens,
        COALESCE(SUM(e.cache_creation_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(e.cache_read_tokens), 0)     AS cache_read_tokens,
        COALESCE(SUM(e.total_tokens), 0)          AS total_tokens
      FROM cc_events e
      JOIN cc_sessions s ON s.session_id = e.session_id
      WHERE ${projectDateConditions.join(' AND ')}
      GROUP BY s.project_dir
      ORDER BY total_tokens DESC`,
      projectDateParams
    );

    const [byModel] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(model, 'unknown')                AS model,
        COUNT(*)                                  AS event_count,
        COALESCE(SUM(input_tokens), 0)            AS input_tokens,
        COALESCE(SUM(output_tokens), 0)           AS output_tokens,
        COALESCE(SUM(cache_creation_tokens), 0)   AS cache_write_tokens,
        COALESCE(SUM(cache_read_tokens), 0)       AS cache_read_tokens,
        COALESCE(SUM(total_tokens), 0)            AS total_tokens
      FROM cc_events
      ${whereClause}
      GROUP BY model
      ORDER BY total_tokens DESC`,
      dateParams
    );

    const mapRow = (r: RowDataPacket) => {
      const i = Number(r.input_tokens);
      const o = Number(r.output_tokens);
      const cwr = Number(r.cache_write_tokens);
      const crr = Number(r.cache_read_tokens);
      return {
        ...r,
        input_tokens: i,
        output_tokens: o,
        cache_write_tokens: cwr,
        cache_read_tokens: crr,
        total_tokens: Number(r.total_tokens),
        event_count: r.event_count ? Number(r.event_count) : undefined,
        cost: calcCost(i, o, cwr, crr),
      };
    };

    return NextResponse.json({
      totals: {
        input_tokens: inp,
        output_tokens: out,
        cache_write_tokens: cw,
        cache_read_tokens: cr,
        total_tokens: tot,
        total_cost: cost,
        cache_efficiency: Math.round(cacheEfficiency * 10) / 10,
        first_event_at: totalsRow.first_event_at ?? null,
        last_event_at: totalsRow.last_event_at ?? null,
      },
      by_project: byProject.map(mapRow),
      by_model: byModel.map(mapRow),
    });
  } catch (error) {
    console.error('Tokens error:', error);
    return NextResponse.json({ error: 'Failed to fetch token data' }, { status: 500 });
  }
}
