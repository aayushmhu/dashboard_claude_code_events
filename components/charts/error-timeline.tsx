'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import { CHART_COLORS, CT, AXIS_TICK, GRID_STROKE } from '@/lib/utils';

interface ErrorTimelineProps {
  errors: Array<{ timestamp: string; tool_name?: string; error_message?: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CT.box}>
      <p style={{ ...CT.label, marginBottom: 6 }}>
        {(() => { try { return format(new Date(label), 'MMM d HH:mm'); } catch { return label; } })()}
      </p>
      <p style={{ ...CT.val, color: CHART_COLORS.rose }}>
        {payload[0].value} error{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

export function ErrorTimeline({ errors }: ErrorTimelineProps) {
  const byHour = new Map<string, number>();
  for (const e of errors) {
    try {
      const hour = format(new Date(e.timestamp), 'yyyy-MM-dd HH:00');
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    } catch { /* skip */ }
  }

  const data = Array.from(byHour.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, count]) => ({ time, count }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(v) => { try { return format(new Date(v), 'MMM d HH:mm'); } catch { return v; } }}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={24}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="count" name="Errors" fill={CHART_COLORS.rose} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  );
}
