'use client';

import { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TokenTimelinePoint } from '@/lib/types';
import { CHART_COLORS, formatTokens, formatCost, CT, AXIS_TICK, GRID_STROKE } from '@/lib/utils';
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

const BARS = [
  { key: 'cache_read_tokens',  name: 'Cache Read',  color: '#10B981' },
  { key: 'cache_write_tokens', name: 'Cache Write', color: '#F59E0B' },
  { key: 'input_tokens',       name: 'Input',       color: '#94A3B8' },
  { key: 'output_tokens',      name: 'Output',      color: '#3B82F6' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter((p: { value: number; dataKey: string }) => p.value > 0 && p.dataKey !== 'cost');
  const costEntry = payload.find((p: { dataKey: string }) => p.dataKey === 'cost');
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
      {costEntry && costEntry.value > 0 && (
        <div style={CT.divider}>
          <span style={CT.name}>Cost</span>
          <span style={{ ...CT.val, color: CHART_COLORS.amber }}>{formatCost(costEntry.value)}</span>
        </div>
      )}
    </div>
  );
}

export function TokenTimeline({ data }: TokenTimelineProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
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
            yAxisId="tokens"
            tickFormatter={(v) => formatTokens(v)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
            tickFormatter={(v) => formatCost(v)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
          {BARS.map(({ key, color }) => (
            <Bar
              key={key}
              yAxisId="tokens"
              dataKey={key}
              stackId="tokens"
              fill={color}
              fillOpacity={hovered !== null && hovered !== key ? 0.25 : 0.85}
              isAnimationActive={false}
            />
          ))}
          <Line
            yAxisId="cost"
            dataKey="cost"
            stroke={CHART_COLORS.amber}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {BARS.map(({ key, name, color }) => (
          <span
            key={key}
            className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none transition-opacity"
            style={{ opacity: hovered !== null && hovered !== key ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ background: color }} />
            <span style={{ color: hovered === key ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
              {name}
            </span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-px w-4 shrink-0" style={{ background: CHART_COLORS.amber }} />
          Cost
        </span>
      </div>
    </div>
  );
}
