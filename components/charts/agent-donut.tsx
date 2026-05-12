'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { AgentStats } from '@/lib/types';
import { CHART_COLORS, CT } from '@/lib/utils';

interface AgentDonutProps {
  data: AgentStats[];
}

const COLORS = [CHART_COLORS.blue, CHART_COLORS.violet, CHART_COLORS.indigo, CHART_COLORS.amber, CHART_COLORS.emerald];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div style={CT.box}>
      <p style={{ ...CT.val, marginBottom: 4 }}>{entry.name}</p>
      <p style={{ ...CT.val, color: entry.payload.fill }}>
        {entry.value.toLocaleString()} events
      </p>
    </div>
  );
}

export function AgentDonut({ data }: AgentDonutProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const chartData = data.map((d) => ({
    name: d.agent_type ? `${d.agent} (${d.agent_type})` : d.agent,
    value: d.event_count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        No agent data
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={76}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
            onMouseLeave={() => setHovered(null)}
          >
            {chartData.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
                fillOpacity={hovered !== null && hovered !== index ? 0.15 : 0.9}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer', transition: 'fill-opacity 0.15s' }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2 px-2">
        {chartData.map((entry, index) => (
          <div
            key={entry.name}
            className="flex items-center gap-1.5 cursor-pointer select-none transition-opacity"
            style={{ opacity: hovered !== null && hovered !== index ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: COLORS[index % COLORS.length] }}
            />
            <span
              className="text-[11px] truncate max-w-[120px]"
              style={{ color: hovered === index ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
              title={entry.name}
            >
              {entry.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
