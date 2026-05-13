'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_SCOPES = [
  { key: '1h',  label: 'Last 1h' },
  { key: '5h',  label: 'Last 5h' },
  { key: '24h', label: 'Last 24h' },
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

interface Props {
  current?: string;
  /** Subset of scope keys to render. Defaults to dashboard set (no 'all'). */
  options?: string[];
  /** When true (on /tokens), changing scope also clears start/end. */
  clearDateRange?: boolean;
  /** When true, append a "Custom…" chip that opens a date-range popover. */
  customMode?: boolean;
}

export function ScopePicker({ current = '24h', options, clearDateRange = false, customMode = false }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const customStart = params.get('start') ?? '';
  const customEnd = params.get('end') ?? '';
  const hasCustom = !!(customStart || customEnd);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tempStart, setTempStart] = useState(customStart);
  const [tempEnd, setTempEnd] = useState(customEnd);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTempStart(customStart); setTempEnd(customEnd); }, [customStart, customEnd]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopoverOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  const visible = options
    ? ALL_SCOPES.filter(s => options.includes(s.key))
    : ALL_SCOPES.filter(s => s.key !== 'all');

  const onChange = (k: string) => {
    const p = new URLSearchParams(params.toString());
    p.set('scope', k);
    if (clearDateRange) {
      p.delete('start');
      p.delete('end');
    }
    router.push(`${pathname}?${p.toString()}`);
  };

  const applyCustom = () => {
    const p = new URLSearchParams(params.toString());
    if (tempStart) p.set('start', tempStart); else p.delete('start');
    if (tempEnd)   p.set('end',   tempEnd);   else p.delete('end');
    p.delete('scope');
    p.delete('page');
    router.push(`${pathname}?${p.toString()}`);
    setPopoverOpen(false);
  };

  const customLabel = () => {
    if (!hasCustom) return 'Custom…';
    if (customStart && customEnd) return `${customStart} – ${customEnd}`;
    if (customStart) return `From ${customStart}`;
    return `Until ${customEnd}`;
  };

  return (
    <div ref={popoverRef} className="relative inline-block">
      {/* Segmented chip group. overflow-hidden keeps the rounded ends crisp;
          the popover renders as a SIBLING below so it isn't clipped. */}
      <div className="inline-flex h-8 rounded-lg border border-border bg-card overflow-hidden text-xs">
        {visible.map((s, i) => {
          const isActive = !hasCustom && current === s.key;
          return (
            <button
              key={s.key}
              onClick={() => onChange(s.key)}
              className={cn(
                'px-3 transition-colors whitespace-nowrap',
                i > 0 && 'border-l border-border',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              {s.label}
            </button>
          );
        })}

        {customMode && (
          <button
            onClick={() => setPopoverOpen(!popoverOpen)}
            className={cn(
              'h-full px-3 border-l border-border flex items-center gap-1.5 transition-colors whitespace-nowrap',
              hasCustom
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
          >
            <Calendar className="h-3 w-3" />
            {customLabel()}
          </button>
        )}
      </div>

      {customMode && popoverOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-card shadow-lg p-3 space-y-2 min-w-[280px]">
          <p className="text-xs text-muted-foreground mb-1">Pick a custom date range</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={tempStart}
              onChange={(e) => setTempStart(e.target.value)}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs dark:[color-scheme:dark]"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="date"
              value={tempEnd}
              onChange={(e) => setTempEnd(e.target.value)}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs dark:[color-scheme:dark]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { setPopoverOpen(false); setTempStart(customStart); setTempEnd(customEnd); }}
              className="text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={applyCustom}
              disabled={!tempStart && !tempEnd}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
