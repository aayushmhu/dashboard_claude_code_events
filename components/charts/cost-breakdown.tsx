'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts';
import { ProjectTokenStats } from '@/lib/types';
import { CHART_COLORS, formatCost, formatTokens, CT, AXIS_TICK, GRID_STROKE } from '@/lib/utils';

interface CostBreakdownProps {
  data: ProjectTokenStats[];
}

const BAR_COLORS = [
  CHART_COLORS.blue, CHART_COLORS.violet, CHART_COLORS.rose,
  CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.indigo, CHART_COLORS.slate,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const totalTokens = entry?.payload?.total_tokens ?? 0;
  return (
    <div style={{ ...CT.box, minWidth: '160px' }}>
      <p style={{ ...CT.val, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={CT.row}>
          <span style={CT.name}>Cost</span>
          <span style={{ ...CT.val, color: CHART_COLORS.amber }}>{formatCost(entry.value)}</span>
        </div>
        {totalTokens > 0 && (
          <div style={CT.row}>
            <span style={CT.name}>Tokens</span>
            <span style={CT.val}>{formatTokens(totalTokens)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function CostBreakdown({ data }: CostBreakdownProps) {
  const chartData = data.slice(0, 10).map((d) => ({ ...d, name: d.project_name }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 36)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCost(v)}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...AXIS_TICK, fontSize: 11, fill: 'hsl(var(--foreground))' }}
          axisLine={false}
          tickLine={false}
          width={160}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="cost" radius={[0, 6, 6, 0]} maxBarSize={20}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
