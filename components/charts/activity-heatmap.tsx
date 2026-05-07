'use client';

import { eachDayOfInterval, format, startOfWeek, subDays } from 'date-fns';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface HeatmapDay {
  day: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapDay[];
}

function intensityClass(count: number): string {
  if (count === 0) return 'bg-muted/40';
  if (count <= 3) return 'bg-emerald-900';
  if (count <= 9) return 'bg-emerald-700';
  if (count <= 24) return 'bg-emerald-500';
  return 'bg-emerald-300';
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_SHOW = new Set([1, 3, 5]);

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const today = new Date();
  const gridStart = startOfWeek(subDays(today, 7 * 52), { weekStartsOn: 0 });
  const allDays = eachDayOfInterval({ start: gridStart, end: today });

  const countMap = new Map<string, number>(data.map((d) => [d.day, d.count]));

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    const week: (Date | null)[] = allDays.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstReal = week.find(Boolean);
    if (firstReal && firstReal.getMonth() !== lastMonth) {
      monthLabels.push({ col: wi, label: format(firstReal, 'MMM') });
      lastMonth = firstReal.getMonth();
    }
  });

  return (
    <div className="w-full flex flex-col gap-[3px]">
      {/* Month labels */}
      <div className="flex gap-[2px] pl-8 mb-0.5">
        {weeks.map((_, wi) => {
          const ml = monthLabels.find((m) => m.col === wi);
          return (
            <div key={wi} className="flex-1 min-w-0 text-[9px] text-muted-foreground/60 leading-none truncate">
              {ml?.label ?? ''}
            </div>
          );
        })}
      </div>

      {/* Grid rows */}
      {Array.from({ length: 7 }).map((_, dow) => (
        <div key={dow} className="flex items-center gap-[2px]">
          <div className="w-8 shrink-0 text-[9px] text-muted-foreground/60 text-right pr-1.5">
            {DOW_SHOW.has(dow) ? DOW_LABELS[dow] : ''}
          </div>
          {weeks.map((week, wi) => {
            const day = week[dow];
            if (!day) return <div key={wi} className="flex-1 min-w-0 aspect-square" />;
            const dayStr = format(day, 'yyyy-MM-dd');
            const count = countMap.get(dayStr) ?? 0;
            return (
              <Tooltip key={wi}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex-1 min-w-0 aspect-square rounded-[2px] cursor-default transition-opacity hover:opacity-70 ${intensityClass(count)}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {count === 0
                    ? `No events on ${format(day, 'MMM d, yyyy')}`
                    : `${count} event${count !== 1 ? 's' : ''} on ${format(day, 'MMM d, yyyy')}`}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-1 pl-8">
        <span className="text-[9px] text-muted-foreground/50">Less</span>
        {[0, 1, 5, 15, 30].map((n) => (
          <div key={n} className={`w-3 h-3 rounded-sm shrink-0 ${intensityClass(n)}`} />
        ))}
        <span className="text-[9px] text-muted-foreground/50">More</span>
      </div>
    </div>
  );
}
