'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
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
  const [hovered, setHovered] = useState<number | null>(null);

  const chartData = data.map((d) => ({
    name: d.model === 'unknown' ? 'Unknown' : d.model.replace('claude-', '').replace(/-\d{8}$/, ''),
    value: d.total_tokens,
    cost: d.cost,
    fullName: d.model,
  }));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
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
            onMouseLeave={() => setHovered(null)}
          >
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={hovered !== null && hovered !== i ? 0.15 : 0.9}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer', transition: 'fill-opacity 0.15s' }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2">
        {chartData.map((entry, i) => (
          <div
            key={entry.name}
            className="flex items-center gap-1.5 cursor-pointer select-none transition-opacity"
            style={{ opacity: hovered !== null && hovered !== i ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span
              className="text-[11px]"
              style={{ color: hovered === i ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
            >
              {entry.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
