'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TimelinePoint } from '@/lib/types';
import { EVENT_TYPE_COLORS } from '@/lib/utils';
import { format } from 'date-fns';

interface ActivityTimelineProps {
  data: TimelinePoint[];
}

const EVENT_TYPES = ['UserPromptSubmit', 'Stop', 'PostToolUse', 'SubagentStop', 'Notification'];

function formatTick(value: string) {
  try {
    return format(new Date(value), 'MMM d HH:mm');
  } catch {
    return value;
  }
}

export function ActivityTimeline({ data }: ActivityTimelineProps) {
  const presentTypes = EVENT_TYPES.filter((et) => data.some((d) => d[et] !== undefined));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          {presentTypes.map((et) => (
            <linearGradient key={et} id={`grad-${et}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={EVENT_TYPE_COLORS[et]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={EVENT_TYPE_COLORS[et]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <XAxis
          dataKey="time"
          tickFormatter={formatTick}
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
          labelFormatter={formatTick}
        />
        <Legend
          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          formatter={(value) => value}
        />
        {presentTypes.map((et) => (
          <Area
            key={et}
            type="monotone"
            dataKey={et}
            name={et}
            stroke={EVENT_TYPE_COLORS[et]}
            fill={`url(#grad-${et})`}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
