'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AgentStats } from '@/lib/types';
import { CHART_COLORS } from '@/lib/utils';

interface AgentDonutProps {
  data: AgentStats[];
}

const COLORS = [CHART_COLORS.blue, CHART_COLORS.violet, CHART_COLORS.indigo, CHART_COLORS.amber];

export function AgentDonut({ data }: AgentDonutProps) {
  const chartData = data.map((d) => ({
    name: d.agent_type ? `${d.agent} (${d.agent_type})` : d.agent,
    value: d.event_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(222.2, 47.4%, 11.2%)',
            border: '1px solid hsl(217.2, 32.6%, 17.5%)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px' }}
          formatter={(value) => <span className="text-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
