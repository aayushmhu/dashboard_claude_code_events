'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { ToolStats } from '@/lib/types';
import { TOOL_COLORS, CHART_COLORS, CT, AXIS_TICK, GRID_STROKE } from '@/lib/utils';

interface ToolUsageBarProps {
  data: ToolStats[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const total = entry?.payload?._total ?? 1;
  const pct = ((entry.value / total) * 100).toFixed(1);
  const errorCount = entry?.payload?.error_count ?? 0;
  const errorRate = entry?.payload?.error_rate ?? 0;
  return (
    <div style={{ ...CT.box, minWidth: '150px', padding: '12px 14px' }}>
      <p style={{ ...CT.val, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={CT.row}>
          <span style={CT.name}>Calls</span>
          <span style={CT.val}>{entry.value.toLocaleString()}</span>
        </div>
        <div style={CT.row}>
          <span style={CT.name}>Share</span>
          <span style={{ ...CT.val, color: entry.color }}>{pct}%</span>
        </div>
        {errorCount > 0 && (
          <div style={CT.row}>
            <span style={CT.name}>Errors</span>
            <span style={{ ...CT.val, color: 'hsl(var(--destructive))' }}>
              {errorCount} ({errorRate}%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolUsageBar({ data }: ToolUsageBarProps) {
  const totalCalls = data.reduce((s, t) => s + t.total_calls, 0);
  const chartData = data.slice(0, 10).map((t) => ({ ...t, _total: totalCalls }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis
          type="number"
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="tool_name"
          tick={{ ...AXIS_TICK, fontSize: 12, fill: 'hsl(var(--foreground))' }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="total_calls" name="Calls" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {chartData.map((entry) => (
            <Cell
              key={entry.tool_name}
              fill={TOOL_COLORS[entry.tool_name] || CHART_COLORS.slate}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
