'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ModelStats } from '@/lib/types';
import { CHART_COLORS, formatTokens, formatCost } from '@/lib/utils';

interface ModelBreakdownProps {
  data: ModelStats[];
}

const COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.violet,
  CHART_COLORS.rose,
  CHART_COLORS.amber,
  CHART_COLORS.emerald,
  CHART_COLORS.indigo,
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
  border: '1px solid hsl(217.2, 32.6%, 17.5%)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(210, 40%, 98%)',
};

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
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'hsl(210, 40%, 98%)', fontWeight: 500 }}
          itemStyle={{ color: 'hsl(210, 40%, 98%)' }}
          formatter={(value: number, _name: string, entry: { payload?: { name?: string; cost?: number } }) => {
            const cost = entry?.payload?.cost ?? 0;
            return [`${formatTokens(value)} tokens · ${formatCost(cost)}`, 'Usage'];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          formatter={(value) => <span className="text-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
