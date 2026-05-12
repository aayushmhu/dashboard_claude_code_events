'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TimelinePoint } from '@/lib/types';
import { EVENT_TYPE_COLORS, CT, AXIS_TICK, GRID_STROKE } from '@/lib/utils';
import { format } from 'date-fns';

interface ActivityTimelineProps {
  data: TimelinePoint[];
}

const EVENT_TYPES = ['UserPromptSubmit', 'Stop', 'PostToolUse', 'SubagentStop', 'Notification'];

const EVENT_LABELS: Record<string, string> = {
  UserPromptSubmit: 'Prompts',
  Stop: 'Responses',
  PostToolUse: 'Tool Calls',
  SubagentStop: 'Subagents',
  Notification: 'Notifications',
};

function formatTick(value: string) {
  try {
    return format(new Date(value), 'MMM d HH:mm');
  } catch {
    return value;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter((p: { value: number }) => p.value > 0);
  if (!filtered.length) return null;
  return (
    <div style={{ ...CT.box, minWidth: '160px', padding: '12px 14px' }}>
      <p style={{ ...CT.label, marginBottom: 10 }}>{formatTick(label)}</p>
      {filtered.map((entry: { name: string; value: number; color: string }, i: number) => (
        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < filtered.length - 1 ? 5 : 0 }}>
          <div style={CT.dot(entry.color)} />
          <span style={{ ...CT.name, flex: 1 }}>{EVENT_LABELS[entry.name] ?? entry.name}</span>
          <span style={{ ...CT.val, marginLeft: 12 }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityTimeline({ data }: ActivityTimelineProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const presentTypes = EVENT_TYPES.filter((et) => data.some((d) => d[et] !== undefined));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <defs>
            {presentTypes.map((et) => (
              <linearGradient key={et} id={`grad-${et}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EVENT_TYPE_COLORS[et]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={EVENT_TYPE_COLORS[et]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatTick}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
          {presentTypes.map((et) => {
            const dimmed = hovered !== null && hovered !== et;
            return (
              <Area
                key={et}
                type="monotone"
                dataKey={et}
                name={et}
                stroke={EVENT_TYPE_COLORS[et]}
                strokeOpacity={dimmed ? 0.12 : 1}
                fill={dimmed ? 'transparent' : `url(#grad-${et})`}
                strokeWidth={hovered === et ? 2.5 : 2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {presentTypes.map((et) => (
          <span
            key={et}
            className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none transition-opacity"
            style={{ opacity: hovered !== null && hovered !== et ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(et)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: EVENT_TYPE_COLORS[et] }} />
            <span className={hovered === et ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {EVENT_LABELS[et] ?? et}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
