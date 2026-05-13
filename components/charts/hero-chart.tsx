'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface HeroChartPoint {
  day: string;
  events: number;
  tool_calls: number;
  errors: number;
}

interface HeroChartProps {
  data: HeroChartPoint[];
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 130,
      }}
    >
      <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 6, fontWeight: 500 }}>
        {label}
      </p>
      {payload.map((item) => (
        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{item.name}</span>
          </span>
          <span style={{ fontSize: 12, color: 'hsl(var(--foreground))', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HeroChart({ data }: HeroChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    other: Math.max(0, d.events - d.tool_calls - d.errors),
  }));

  if (formatted.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">No data for the last 7 days.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={formatted} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
        <Bar dataKey="other" stackId="a" fill="#6366F1" name="Events" isAnimationActive={false} />
        <Bar dataKey="tool_calls" stackId="a" fill="#F59E0B" name="Tool calls" isAnimationActive={false} />
        <Bar dataKey="errors" stackId="a" fill="#EF4444" name="Errors" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
