'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CT, AXIS_TICK, GRID_STROKE, CHART_COLORS, formatCost } from '@/lib/utils';
import { format, parseISO, eachDayOfInterval, subDays } from 'date-fns';
import type { ProjectDetailCostTimelinePoint } from '@/app/api/projects/detail/route';

type Scope = '7d' | '30d' | '90d' | 'all';

const SCOPES: { label: string; value: Scope }[] = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
];

const AMBER = CHART_COLORS.amber;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div style={{ ...CT.box, minWidth: '140px', padding: '10px 14px' }}>
      <p style={{ ...CT.label, marginBottom: 6 }}>
        {label ? format(parseISO(label), 'MMM d, yyyy') : ''}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={CT.dot(AMBER)} />
        <span style={{ ...CT.name, flex: 1 }}>Cost</span>
        <span style={CT.val}>{formatCost(value)}</span>
      </div>
    </div>
  );
}

function fillDays(
  points: ProjectDetailCostTimelinePoint[],
  scope: Scope,
): { date: string; cost: number }[] {
  const costMap = new Map<string, number>();
  for (const p of points) {
    costMap.set(p.date, p.cost);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let start: Date;
  if (scope === '7d') {
    start = subDays(today, 6);
  } else if (scope === '30d') {
    start = subDays(today, 29);
  } else if (scope === '90d') {
    start = subDays(today, 89);
  } else {
    // For 'all', use the earliest date in the data or today if empty
    if (points.length === 0) return [];
    start = parseISO(points[0].date);
  }

  const days = eachDayOfInterval({ start, end: today });
  return days.map((d) => {
    const key = format(d, 'yyyy-MM-dd');
    return { date: key, cost: costMap.get(key) ?? 0 };
  });
}

export function CostTimeline({ project }: { project: string }) {
  const [scope, setScope] = useState<Scope>('30d');
  const [data, setData] = useState<{ date: string; cost: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/projects/detail?project=${encodeURIComponent(project)}&cost_scope=${scope}`,
    )
      .then((r) => r.json())
      .then((json) => {
        const filled = fillDays(json.cost_timeline ?? [], scope);
        setData(filled);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [project, scope]);

  const allZero = data.every((d) => d.cost === 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            Cost over time
          </CardTitle>
          <div className="flex items-center gap-1">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                onClick={() => setScope(s.value)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  scope === s.value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        ) : allZero || data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-xs text-muted-foreground text-center">No activity in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-cost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AMBER} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => {
                  try {
                    return format(parseISO(v), 'MMM d');
                  } catch {
                    return v;
                  }
                }}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatCost}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                content={<CostTooltip />}
                cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke={AMBER}
                strokeWidth={2}
                fill="url(#grad-cost)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
