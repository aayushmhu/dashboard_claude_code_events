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
import { ToolStats } from '@/lib/types';
import { TOOL_COLORS, CHART_COLORS } from '@/lib/utils';

interface ToolUsageBarProps {
  data: ToolStats[];
}

export function ToolUsageBar({ data }: ToolUsageBarProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
      >
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'hsl(215, 20%, 55%)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="tool_name"
          tick={{ fontSize: 12, fill: 'hsl(215, 20%, 70%)' }}
          axisLine={false}
          tickLine={false}
          width={60}
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
        <Bar dataKey="total_calls" name="Calls" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry) => (
            <Cell
              key={entry.tool_name}
              fill={TOOL_COLORS[entry.tool_name] || CHART_COLORS.slate}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
