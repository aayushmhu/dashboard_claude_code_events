'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, TrendingUp } from 'lucide-react';
import { formatTokens, formatCost, calcCost, toSqliteTimestamp, cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ScopePicker } from '@/components/scope-picker';
import { TOKEN_COLORS } from '@/lib/colors';
import type { ModelStats } from '@/lib/types';

const SCOPE_MS: Record<string, number | null> = {
  '1h':  60 * 60 * 1000,
  '5h':  5 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': null,
};

type TypeKey = 'input' | 'output' | 'cacheWrite' | 'cacheRead';

const TYPE_META: { key: TypeKey; label: string; color: string }[] = [
  { key: 'input',      label: 'Input',       color: TOKEN_COLORS.input      },
  { key: 'output',     label: 'Output',      color: TOKEN_COLORS.output     },
  { key: 'cacheWrite', label: 'Cache Write', color: TOKEN_COLORS.cacheWrite },
  { key: 'cacheRead',  label: 'Cache Read',  color: TOKEN_COLORS.cacheRead  },
];

function CostMixBar({
  parts, total,
}: { parts: { value: number; color: string }[]; total: number }) {
  if (total <= 0) {
    return <span className="text-muted-foreground/40 text-xs">—</span>;
  }
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div className="flex h-2 rounded-sm overflow-hidden bg-muted/30 w-28">
      {visible.map((p, i) => (
        <div
          key={i}
          style={{ background: p.color, flexGrow: p.value / total }}
        />
      ))}
    </div>
  );
}

function breakdownFor(r: ModelStats): Record<TypeKey, { tokens: number; cost: number }> {
  return {
    input:      { tokens: r.input_tokens,        cost: calcCost(r.input_tokens, 0, 0, 0, r.model) },
    output:     { tokens: r.output_tokens,       cost: calcCost(0, r.output_tokens, 0, 0, r.model) },
    cacheWrite: { tokens: r.cache_write_tokens,  cost: calcCost(0, 0, r.cache_write_tokens, 0, r.model) },
    cacheRead:  { tokens: r.cache_read_tokens,   cost: calcCost(0, 0, 0, r.cache_read_tokens, r.model) },
  };
}

export function Usage() {
  const params = useSearchParams();
  const scope = params.get('scope') ?? '30d';
  const customStart = params.get('start') ?? '';
  const customEnd = params.get('end') ?? '';

  const [rows, setRows] = useState<ModelStats[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRows(null);
    setError(false);

    const qs = new URLSearchParams();
    if (customStart || customEnd) {
      if (customStart) qs.set('start', customStart);
      if (customEnd)   qs.set('end',   customEnd);
    } else if (scope in SCOPE_MS && SCOPE_MS[scope] !== null) {
      qs.set('start', toSqliteTimestamp(new Date(Date.now() - SCOPE_MS[scope]!)));
    }
    const url = `/api/tokens${qs.toString() ? `?${qs}` : ''}`;

    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const byModel: ModelStats[] = (data.by_model ?? []).filter(
          (r: ModelStats) => r.model && r.model.trim() && r.model !== 'unknown',
        );
        setRows([...byModel].sort((a, b) => b.cost - a.cost));
      })
      .catch(() => setError(true));
  }, [scope, customStart, customEnd]);

  const activeScope = (customStart || customEnd) ? '' : (scope in SCOPE_MS ? scope : '30d');

  const toggle = (model: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const aggregate = rows
    ? rows.reduce(
        (acc, r) => {
          const b = breakdownFor(r);
          return {
            totalTokens: acc.totalTokens + r.total_tokens,
            totalCost:   acc.totalCost   + r.cost,
            input:       acc.input       + b.input.cost,
            output:      acc.output      + b.output.cost,
            cacheWrite:  acc.cacheWrite  + b.cacheWrite.cost,
            cacheRead:   acc.cacheRead   + b.cacheRead.cost,
          };
        },
        { totalTokens: 0, totalCost: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
      )
    : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Your usage</h2>
        <div className="ml-auto">
          <ScopePicker
            current={activeScope}
            options={['1h', '5h', '24h', '7d', '30d', 'all']}
            clearDateRange
            customMode
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {rows === null && !error && (
          <div className="p-5 space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load usage data.
          </div>
        )}

        {rows !== null && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-12 px-4">
            <TrendingUp className="h-10 w-10 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium">No usage in this period.</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Try a wider time range, or run some Claude Code sessions and check back.
            </p>
          </div>
        )}

        {rows !== null && rows.length > 0 && aggregate && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium text-right">Tokens</th>
                  <th className="px-4 py-3 font-medium">Cost mix</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = expanded.has(r.model);
                  const b = breakdownFor(r);
                  return (
                    <Row
                      key={r.model}
                      row={r}
                      isOpen={isOpen}
                      onToggle={() => toggle(r.model)}
                      breakdown={b}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    All models
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">
                    {formatTokens(aggregate.totalTokens)}
                  </td>
                  <td className="px-4 py-3">
                    <CostMixBar
                      parts={[
                        { value: aggregate.input,      color: TOKEN_COLORS.input      },
                        { value: aggregate.output,     color: TOKEN_COLORS.output     },
                        { value: aggregate.cacheWrite, color: TOKEN_COLORS.cacheWrite },
                        { value: aggregate.cacheRead,  color: TOKEN_COLORS.cacheRead  },
                      ]}
                      total={aggregate.totalCost}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                    {formatCost(aggregate.totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  row, isOpen, onToggle, breakdown,
}: {
  row: ModelStats;
  isOpen: boolean;
  onToggle: () => void;
  breakdown: Record<TypeKey, { tokens: number; cost: number }>;
}) {
  const parts = TYPE_META.map((t) => ({ value: breakdown[t.key].cost, color: t.color }));

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors',
          isOpen && 'bg-muted/20',
        )}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0',
                isOpen && 'rotate-90',
              )}
            />
            <span className="font-medium">{row.model}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right font-mono text-foreground">
          {formatTokens(row.total_tokens)}
        </td>
        <td className="px-4 py-3">
          <CostMixBar parts={parts} total={row.cost} />
        </td>
        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
          {formatCost(row.cost)}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-border/50 bg-muted/10">
          <td colSpan={4} className="px-4 py-3">
            <div className="ml-6 mr-2 rounded-lg border border-border/40 bg-card divide-y divide-border/30">
              {TYPE_META.map((t) => {
                const cell = breakdown[t.key];
                if (cell.tokens === 0) return null;
                const pct = row.cost > 0 ? Math.round((cell.cost / row.cost) * 100) : 0;
                return (
                  <div
                    key={t.key}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: t.color }}
                    />
                    <span className="flex-1 text-muted-foreground">{t.label}</span>
                    <span className="font-mono text-foreground w-20 text-right">
                      {formatTokens(cell.tokens)}
                    </span>
                    <span className="font-mono text-foreground w-20 text-right">
                      {formatCost(cell.cost)}
                    </span>
                    <span className="font-mono text-muted-foreground w-10 text-right text-xs">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
