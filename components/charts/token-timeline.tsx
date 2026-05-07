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
import { TokenTimelinePoint } from '@/lib/types';
import { CHART_COLORS, formatTokens } from '@/lib/utils';
import { format } from 'date-fns';

interface TokenTimelineProps {
  data: TokenTimelinePoint[];
}

function formatTick(value: string) {
  try {
    return format(new Date(value), 'MMM d');
  } catch {
    return value;
  }
}

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
  border: '1px solid hsl(217.2, 32.6%, 17.5%)',
  borderRadius: '8px',
  fontSize: '12px',
};

export function TokenTimeline({ data }: TokenTimelineProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-input" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-output" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.rose} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.rose} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-cache-read" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.emerald} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
          </linearGradient>
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
          tickFormatter={(v) => formatTokens(v)}
          tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }}
          axisLine={false}
          tickLine={false}
          width={50}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={formatTick}
          formatter={(value: number, name: string) => [formatTokens(value), name]}
        />
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
        <Area
          type="monotone"
          dataKey="input_tokens"
          name="Input"
          stroke={CHART_COLORS.blue}
          fill="url(#grad-input)"
          strokeWidth={1.5}
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="output_tokens"
          name="Output"
          stroke={CHART_COLORS.rose}
          fill="url(#grad-output)"
          strokeWidth={1.5}
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="cache_read_tokens"
          name="Cache Read"
          stroke={CHART_COLORS.emerald}
          fill="url(#grad-cache-read)"
          strokeWidth={1.5}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
