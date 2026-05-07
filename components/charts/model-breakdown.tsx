'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ModelStats } from '@/lib/types';
import { CHART_COLORS, formatTokens, formatCost, CT } from '@/lib/utils';

interface ModelBreakdownProps {
  data: ModelStats[];
}

const COLORS = [
  CHART_COLORS.blue, CHART_COLORS.violet, CHART_COLORS.rose,
  CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.indigo,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const cost = entry?.payload?.cost ?? 0;
  return (
    <div style={{ ...CT.box, minWidth: '170px' }}>
      <p style={{ ...CT.label, marginBottom: 8 }}>{entry?.payload?.fullName ?? entry.name}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={CT.row}>
          <span style={CT.name}>Tokens</span>
          <span style={CT.val}>{formatTokens(entry.value)}</span>
        </div>
        <div style={CT.row}>
          <span style={CT.name}>Cost</span>
          <span style={{ ...CT.val, color: CHART_COLORS.amber }}>{formatCost(cost)}</span>
        </div>
      </div>
    </div>
  );
}

export function ModelBreakdown({ data }: ModelBreakdownProps) {
  const chartData = data.map((d) => ({
    name: d.model === 'unknown' ? 'Unknown' : d.model.replace('claude-', '').replace(/-\d{8}$/, ''),
    value: d.total_tokens,
    cost: d.cost,
    fullName: d.model,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={88}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.9} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          formatter={(value) => <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
