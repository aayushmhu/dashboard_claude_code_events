import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

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

// Maps a scope key to a SQLite datetime modifier and a human label.
// 'all' uses a sentinel pre-epoch timestamp so the WHERE clause matches every row.
const SCOPES: Record<string, { sql: string; label: string }> = {
  '1h':  { sql: "datetime('now', '-1 hour')",   label: 'last 1 hour'   },
  '5h':  { sql: "datetime('now', '-5 hours')",  label: 'last 5 hours'  },
  '24h': { sql: "datetime('now', '-1 day')",    label: 'last 24 hours' },
  '7d':  { sql: "datetime('now', '-7 days')",   label: 'last 7 days'   },
  '30d': { sql: "datetime('now', '-30 days')",  label: 'last 30 days'  },
  'all': { sql: "'1970-01-01 00:00:00'",         label: 'all time'      },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scopeKey = searchParams.get('scope') ?? '24h';
  const scope = SCOPES[scopeKey] ?? SCOPES['24h'];
  try {
    const [
      [[sessionRow]],
      [[eventRow]],
      [[projectRow]],
      [entrypointRows],
      [[todayRow]],
      [[yesterdayRow]],
      [weekRows],
      [[prevWeekRow]],
    ] = await Promise.all([
      pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM cc_sessions'),
      pool.query<RowDataPacket[]>('SELECT COUNT(*) as total, COALESCE(SUM(is_error), 0) as errors FROM cc_events'),
      pool.query<RowDataPacket[]>("SELECT COUNT(DISTINCT project_dir) as count FROM cc_sessions WHERE project_dir IS NOT NULL AND project_dir != ''"),
      pool.query<RowDataPacket[]>(
        `SELECT COALESCE(entrypoint, 'cli') AS entrypoint, COUNT(DISTINCT session_id) AS count
         FROM cc_events
         WHERE event_type = 'Stop'
         GROUP BY COALESCE(entrypoint, 'cli')`
      ),
      pool.query<RowDataPacket[]>(
        `SELECT
          COUNT(DISTINCT session_id) as sessions,
          COALESCE(SUM(${COST_SQL}), 0) as cost,
          COALESCE(SUM(is_error), 0) as errors
        FROM cc_events
        WHERE timestamp >= ${scope.sql}`
      ),
      pool.query<RowDataPacket[]>(
        `SELECT
          COALESCE(SUM(${COST_SQL}), 0) as cost,
          COALESCE(SUM(is_error), 0) as errors,
          COUNT(*) as events
        FROM cc_events
        WHERE timestamp >= datetime('now', '-2 days')
          AND timestamp < datetime('now', '-1 day')`
      ),
      pool.query<RowDataPacket[]>(
        `SELECT
          date(timestamp) as day,
          COALESCE(SUM(${COST_SQL}), 0) as cost,
          COUNT(*) as events,
          COALESCE(SUM(is_error), 0) as errors,
          COALESCE(SUM(CASE WHEN event_type IN ('PreToolUse','PostToolUse') THEN 1 ELSE 0 END), 0) as tool_calls,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read,
          COALESCE(SUM(COALESCE(input_tokens,0) + COALESCE(cache_read_tokens,0)), 0) as cacheable
        FROM cc_events
        WHERE timestamp >= datetime('now', '-7 days')
        GROUP BY date(timestamp)
        ORDER BY day ASC`
      ),
      // Prior 7-day totals (days 8–14 ago) for the hero chart's week-over-week delta
      pool.query<RowDataPacket[]>(
        `SELECT
          COUNT(*) as events,
          COALESCE(SUM(is_error), 0) as errors,
          COALESCE(SUM(CASE WHEN event_type IN ('PreToolUse','PostToolUse') THEN 1 ELSE 0 END), 0) as tool_calls
        FROM cc_events
        WHERE timestamp >= datetime('now', '-14 days')
          AND timestamp <  datetime('now', '-7 days')`
      ),
    ]);

    const errorRate =
      eventRow.total > 0
        ? Math.round((eventRow.errors / eventRow.total) * 10000) / 100
        : 0;

    const entrypointBreakdown = (entrypointRows as RowDataPacket[]).map(r => ({
      entrypoint: r.entrypoint as string,
      count: Number(r.count),
    }));

    const weekSparkline = (weekRows as RowDataPacket[]).map(r => ({
      day: r.day as string,
      cost: Number(r.cost),
      events: Number(r.events),
      errors: Number(r.errors),
      tool_calls: Number(r.tool_calls),
      cache_efficiency: Number(r.cacheable) > 0
        ? Math.round(Number(r.cache_read) / Number(r.cacheable) * 1000) / 10
        : 0,
    }));

    return NextResponse.json({
      total_sessions: Number(sessionRow.count),
      total_events: Number(eventRow.total),
      active_projects: Number(projectRow.count),
      error_rate: errorRate,
      entrypoint_breakdown: entrypointBreakdown,
      scope: { key: scopeKey, label: scope.label },
      // `today` actually carries the selected-scope window (24h/7d/30d).
      // Field name kept for backwards compatibility with existing dashboard code.
      today: {
        sessions: Number(todayRow.sessions),
        cost: Number(todayRow.cost),
        errors: Number(todayRow.errors),
      },
      yesterday: {
        cost: Number(yesterdayRow.cost),
        errors: Number(yesterdayRow.errors),
        events: Number(yesterdayRow.events),
      },
      week_sparkline: weekSparkline,
      prev_week_total: {
        events: Number(prevWeekRow?.events ?? 0),
        errors: Number(prevWeekRow?.errors ?? 0),
        tool_calls: Number(prevWeekRow?.tool_calls ?? 0),
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
