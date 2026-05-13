'use client';

import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

interface SparklineCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendPositive?: boolean;
  data: { v: number }[];
  color: string;
}

export function SparklineCard({
  label,
  value,
  subtitle,
  trend,
  trendPositive,
  data,
  color,
}: SparklineCardProps) {
  const gradientId = `spark-${label.replace(/\s/g, '_')}`;

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
      {trend && (
        <p className={`text-xs mt-1 font-medium ${trendPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend}
        </p>
      )}
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={false}
            />
            <Tooltip content={() => null} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
