'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { format, subDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { CalendarDays } from 'lucide-react';

const PRESETS = [
  { label: 'Today',     days: 0  },
  { label: 'Yesterday', days: -1 },
  { label: '7d',        days: 7  },
  { label: '30d',       days: 30 },
  { label: '90d',       days: 90 },
];

interface DateRangePickerProps {
  className?: string;
}

export function DateRangePicker({ className }: DateRangePickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStart = searchParams.get('start') || '';
  const currentEnd = searchParams.get('end') || '';

  function applyRange(start: string, end: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (start) params.set('start', start);
    else params.delete('start');
    if (end) params.set('end', end);
    else params.delete('end');
    params.delete('page');
    // Picking a custom date range overrides any active quick scope.
    params.delete('scope');
    router.push(`?${params}`);
  }

  function applyPreset(days: number) {
    const now = new Date();
    if (days === 0) {
      const today = format(now, 'yyyy-MM-dd');
      applyRange(today, today);
    } else if (days === -1) {
      const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');
      applyRange(yesterday, yesterday);
    } else {
      applyRange(format(subDays(now, days), 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd'));
    }
  }

  function isPresetActive(days: number) {
    const now = new Date();
    if (days === 0) {
      const today = format(now, 'yyyy-MM-dd');
      return currentStart === today && currentEnd === today;
    }
    if (days === -1) {
      const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');
      return currentStart === yesterday && currentEnd === yesterday;
    }
    return (
      currentStart === format(subDays(now, days), 'yyyy-MM-dd') &&
      currentEnd === format(now, 'yyyy-MM-dd')
    );
  }

  const isAllTime = !currentStart && !currentEnd;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESETS.map(({ label, days }) => (
          <Button
            key={label}
            variant={isPresetActive(days) ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyPreset(days)}
            className="h-7 px-2.5 text-xs"
          >
            {label}
          </Button>
        ))}
        <Button
          variant={isAllTime ? 'default' : 'outline'}
          size="sm"
          onClick={() => applyRange('', '')}
          className="h-7 px-2.5 text-xs"
        >
          All time
        </Button>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={currentStart}
          onChange={(e) => applyRange(e.target.value, currentEnd)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground dark:[color-scheme:dark]"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date"
          value={currentEnd}
          onChange={(e) => applyRange(currentStart, e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground dark:[color-scheme:dark]"
        />
      </div>
    </div>
  );
}
