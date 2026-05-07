'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { CHART_COLORS } from '@/lib/utils';

interface ErrorTimelineProps {
  errors: Array<{ timestamp: string; tool_name?: string; error_message?: string }>;
}

export function ErrorTimeline({ errors }: ErrorTimelineProps) {
  // Group by hour
  const byHour = new Map<string, number>();
  for (const e of errors) {
    try {
      const hour = format(new Date(e.timestamp), 'yyyy-MM-dd HH:00');
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    } catch {
      // skip invalid timestamps
    }
  }

  const data = Array.from(byHour.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, count]) => ({ time, count }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="time"
          tickFormatter={(v) => {
            try { return format(new Date(v), 'MMM d HH:mm'); } catch { return v; }
          }}
          tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
            border: '1px solid hsl(217.2, 32.6%, 17.5%)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          cursor={{ fill: 'hsl(217.2, 32.6%, 17.5%)' }}
        />
        <Bar dataKey="count" name="Errors" fill={CHART_COLORS.rose} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
