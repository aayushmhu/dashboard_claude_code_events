'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroChartPoint {
  day: string;          // 'YYYY-MM-DD'
  events: number;
  tool_calls: number;
  errors: number;
}

interface PrevWeekTotal {
  events: number;
  errors: number;
  tool_calls: number;
}

interface HeroChartProps {
  data: HeroChartPoint[];
  prevWeekTotal?: PrevWeekTotal;
}

// Series colors per UX spec — desaturated, low-opacity fill + crisp stroke.
const SERIES = {
  errors:     { fill: '#FCA5A5', stroke: '#F87171', fillOpacity: 0.22, label: 'Errors' },
  tool_calls: { fill: '#FDE68A', stroke: '#FBBF24', fillOpacity: 0.18, label: 'Tool calls' },
  events:     { fill: '#A5B4FC', stroke: '#818CF8', fillOpacity: 0.18, label: 'Events' },
} as const;

// Short weekday format for axis ticks. Only Mon/Wed/Fri/Sun get a label.
const WEEKDAY_SHOW = new Set([0, 1, 3, 5]); // Sun, Mon, Wed, Fri

function dayParts(iso: string) {
  // Treat the date as local for display; ISO key stays canonical for navigation.
  const d = new Date(iso + 'T12:00:00');
  return {
    dow: d.getDay(),
    weekday: d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase(),
    short: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    full: d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' }),
  };
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  dataKey: string;
  color: string;
}
function HeroTooltip({
  active, label, payload,
}: { active?: boolean; label?: string; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length || !label) return null;
  const parts = dayParts(label);
  // Recharts gives payload ordered by series; show errors / tool_calls / events from bottom up.
  const rows = ['errors', 'tool_calls', 'events']
    .map((k) => payload.find((p) => p.dataKey === k))
    .filter((r): r is TooltipPayloadItem => !!r);

  return (
    <div
      className="rounded-xl border border-white/[0.08] shadow-lg p-3 min-w-[180px]"
      style={{ background: 'hsl(var(--popover) / 0.95)', backdropFilter: 'blur(8px)' }}
    >
      <p className="text-xs text-muted-foreground mb-2 flex items-center justify-between gap-3">
        <span>{parts.weekday}</span>
        <span className="font-mono">{parts.short}</span>
      </p>
      <div className="space-y-1">
        {rows.map((r) => {
          const s = SERIES[r.dataKey as keyof typeof SERIES];
          return (
            <div key={r.dataKey} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-sm" style={{ background: s.stroke }} />
                <span className="text-muted-foreground">{s.label}</span>
              </span>
              <span className="font-mono tabular-nums text-foreground/90">
                {r.value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2 pt-2 border-t border-white/[0.06] flex items-center gap-1">
        <ArrowRight className="h-2.5 w-2.5" />
        Click for sessions on this day
      </p>
    </div>
  );
}

export function HeroChart({ data, prevWeekTotal }: HeroChartProps) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (!data || data.length === 0) {
    return <HeroChartSkeleton />;
  }

  // Aggregates for the subtitle + reference line.
  const totalEvents = data.reduce((s, d) => s + d.events, 0);
  const avg = totalEvents / data.length;

  let deltaPct: number | null = null;
  if (prevWeekTotal && prevWeekTotal.events > 0) {
    deltaPct = Math.round((totalEvents - prevWeekTotal.events) / prevWeekTotal.events * 100);
  }
  const deltaPositive = (deltaPct ?? 0) >= 0;

  const todayKey = data[data.length - 1]?.day;

  function navigateToDay(day: string) {
    router.push(`/sessions?start=${encodeURIComponent(day)}&end=${encodeURIComponent(day)}`);
  }

  // Custom tick: brighten + underline + arrow for the active day.
  // Recharts passes payload.value for category axis.
  const renderTick = ({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
    const isActive = activeKey === payload.value;
    const parts = dayParts(payload.value);
    const showLabel = WEEKDAY_SHOW.has(parts.dow) || isActive;
    if (!showLabel) return <g />;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          y={14}
          textAnchor="middle"
          className={cn(
            'text-[11px] uppercase tracking-wider transition-colors',
            isActive ? 'fill-foreground' : 'fill-muted-foreground'
          )}
        >
          {parts.weekday}
        </text>
        {isActive && (
          <>
            <line
              x1={-14} x2={14} y1={20} y2={20}
              stroke="currentColor"
              className="text-foreground"
              strokeWidth={1}
            />
            <text
              x={18}
              y={14}
              className="text-[10px] fill-foreground"
            >
              →
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header: title + delta chip */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Last 7 days</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span className="font-mono tabular-nums text-foreground/80">
              {totalEvents.toLocaleString()}
            </span>
            <span>events</span>
            {deltaPct !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium ml-1',
                  deltaPositive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-rose-500/10 text-rose-400'
                )}
              >
                {deltaPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {deltaPositive ? '+' : ''}{deltaPct}%
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
          onMouseMove={(e) => setActiveKey((e?.activePayload?.[0]?.payload as { day?: string } | undefined)?.day ?? null)}
          onMouseLeave={() => setActiveKey(null)}
          onClick={(e) => {
            const day = (e?.activePayload?.[0]?.payload as { day?: string } | undefined)?.day;
            if (day) navigateToDay(day);
          }}
          style={{ cursor: activeKey ? 'pointer' : 'default' }}
        >
          <defs>
            {(['errors', 'tool_calls', 'events'] as const).map((k) => (
              <linearGradient id={`hero-${k}`} key={k} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[k].fill} stopOpacity={SERIES[k].fillOpacity * 2} />
                <stop offset="100%" stopColor={SERIES[k].fill} stopOpacity={SERIES[k].fillOpacity * 0.4} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.4} />
          <XAxis
            dataKey="day"
            tick={renderTick}
            axisLine={false}
            tickLine={false}
            interval={0}
            height={32}
          />
          <YAxis hide />
          <Tooltip
            content={<HeroTooltip />}
            cursor={{ stroke: 'hsl(var(--foreground))', strokeOpacity: 0.25, strokeWidth: 1, strokeDasharray: '2 2' }}
          />
          {/* Average reference line */}
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: `avg ${Math.round(avg)}`,
                position: 'right',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 10,
              }}
            />
          )}
          {/* Today marker */}
          {todayKey && (
            <ReferenceLine
              x={todayKey}
              stroke="#818CF8"
              strokeDasharray="2 2"
              strokeOpacity={0.4}
              ifOverflow="visible"
            />
          )}
          {/* Stacked areas, errors at bottom anchored */}
          <Area
            type="monotone"
            dataKey="errors"
            stackId="a"
            stroke={SERIES.errors.stroke}
            strokeWidth={1.5}
            fill={`url(#hero-errors)`}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="tool_calls"
            stackId="a"
            stroke={SERIES.tool_calls.stroke}
            strokeWidth={1.5}
            fill={`url(#hero-tool_calls)`}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="events"
            stackId="a"
            stroke={SERIES.events.stroke}
            strokeWidth={1.5}
            fill={`url(#hero-events)`}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: '#818CF8', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Skeleton — 7 shimmer pills at varying heights, matching the chart baseline.
function HeroChartSkeleton() {
  const heights = [40, 70, 55, 85, 60, 95, 75];
  return (
    <div className="space-y-3">
      <div>
        <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
        <div className="h-3 w-36 bg-muted/40 rounded animate-pulse mt-2" />
      </div>
      <div className="flex items-end justify-between gap-2 h-[220px] px-2 pb-8">
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-muted/40 rounded-md animate-pulse"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}
