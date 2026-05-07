'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ProjectTokenStats } from '@/lib/types';
import { CHART_COLORS, formatCost } from '@/lib/utils';

interface CostBreakdownProps {
  data: ProjectTokenStats[];
}

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
  border: '1px solid hsl(217.2, 32.6%, 17.5%)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(210, 40%, 98%)',
};

const BAR_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.violet,
  CHART_COLORS.rose,
  CHART_COLORS.amber,
  CHART_COLORS.emerald,
  CHART_COLORS.indigo,
  CHART_COLORS.slate,
];

export function CostBreakdown({ data }: CostBreakdownProps) {
  const chartData = data.slice(0, 10).map((d) => ({
    name: d.project_name,
    cost: d.cost,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => formatCost(v)}
          tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'hsl(210, 40%, 98%)', fontWeight: 500 }}
          itemStyle={{ color: 'hsl(210, 40%, 98%)' }}
          formatter={(value: number) => [formatCost(value), 'Cost']}
          cursor={{ fill: 'hsl(215, 20%, 20%)', opacity: 0.3 }}
        />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
