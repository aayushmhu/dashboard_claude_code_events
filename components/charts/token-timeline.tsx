'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Brush,
  Legend,
} from 'recharts';
import { TokenTimelinePoint } from '@/lib/types';
import { CHART_COLORS, formatTokens, formatCost, CT, AXIS_TICK, GRID_STROKE } from '@/lib/utils';
import { TOKEN_COLORS } from '@/lib/colors';
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

const SERIES = [
  { key: 'input_tokens',      name: 'Input',      color: TOKEN_COLORS.input },
  { key: 'output_tokens',     name: 'Output',     color: TOKEN_COLORS.output },
  { key: 'cache_read_tokens', name: 'Cache Read', color: TOKEN_COLORS.cacheRead },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter((p: { value: number }) => p.value > 0);
  if (!filtered.length) return null;
  const totalCost = (payload[0]?.payload as TokenTimelinePoint)?.cost ?? 0;
  return (
    <div style={{ ...CT.box, minWidth: '180px', padding: '12px 14px' }}>
      <p style={{ ...CT.label, marginBottom: 10 }}>{formatTick(label)}</p>
      {filtered.map((entry: { name: string; value: number; color: string }, i: number) => (
        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < filtered.length - 1 ? 5 : 0 }}>
          <div style={CT.dot(entry.color)} />
          <span style={{ ...CT.name, flex: 1 }}>{entry.name}</span>
          <span style={{ ...CT.val, marginLeft: 12 }}>{formatTokens(entry.value)}</span>
        </div>
      ))}
      {totalCost > 0 && (
        <div style={CT.divider}>
          <span style={CT.name}>Cost</span>
          <span style={{ ...CT.val, color: CHART_COLORS.amber }}>{formatCost(totalCost)}</span>
        </div>
      )}
    </div>
  );
}

export function TokenTimeline({ data }: TokenTimelineProps) {
  const showBrush = data.length > 14;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          {SERIES.map(({ key, color }) => (
            <linearGradient key={key} id={`tgrad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={formatTick}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => formatTokens(v)}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
        <Legend
          wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
          formatter={(value) => <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
        />
        {SERIES.map(({ key, name, color }) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={name}
            stroke={color}
            fill={`url(#tgrad-${key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
        {showBrush && (
          <Brush
            dataKey="time"
            height={22}
            stroke="hsl(var(--border))"
            fill="hsl(var(--card))"
            travellerWidth={5}
            tickFormatter={formatTick}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
