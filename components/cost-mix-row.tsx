'use client';

import { ChevronRight } from 'lucide-react';
import { formatTokens, formatCost, calcCost, cn } from '@/lib/utils';
import { TOKEN_COLORS } from '@/lib/colors';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface CostMixRowData {
  /** Display label shown in the Model column */
  name?: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  /** Pre-calculated total cost for this row */
  cost: number;
  /**
   * Optional: the full model string, used to look up per-model pricing
   * via calcCost. When omitted, the default (sonnet) rates apply.
   */
  model?: string;
}

type TypeKey = 'input' | 'output' | 'cacheWrite' | 'cacheRead';

export const TYPE_META: { key: TypeKey; label: string; color: string }[] = [
  { key: 'input',      label: 'Input',       color: TOKEN_COLORS.input      },
  { key: 'output',     label: 'Output',      color: TOKEN_COLORS.output     },
  { key: 'cacheWrite', label: 'Cache Write', color: TOKEN_COLORS.cacheWrite },
  { key: 'cacheRead',  label: 'Cache Read',  color: TOKEN_COLORS.cacheRead  },
];

// ─── CostMixBar ───────────────────────────────────────────────────────────────

export function CostMixBar({
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

// ─── breakdownFor ─────────────────────────────────────────────────────────────

export function breakdownFor(r: CostMixRowData): Record<TypeKey, { tokens: number; cost: number }> {
  return {
    input:      { tokens: r.input_tokens,        cost: calcCost(r.input_tokens, 0, 0, 0, r.model) },
    output:     { tokens: r.output_tokens,       cost: calcCost(0, r.output_tokens, 0, 0, r.model) },
    cacheWrite: { tokens: r.cache_write_tokens,  cost: calcCost(0, 0, r.cache_write_tokens, 0, r.model) },
    cacheRead:  { tokens: r.cache_read_tokens,   cost: calcCost(0, 0, 0, r.cache_read_tokens, r.model) },
  };
}

// ─── Row ──────────────────────────────────────────────────────────────────────

export function CostMixRow({
  row,
  isOpen,
  onToggle,
}: {
  row: CostMixRowData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const b = breakdownFor(row);
  const parts = TYPE_META.map((t) => ({ value: b[t.key].cost, color: t.color }));
  const totalTokens = row.input_tokens + row.output_tokens + row.cache_write_tokens + row.cache_read_tokens;

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
            <span className="font-medium">{row.name ?? row.model ?? '—'}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right font-mono text-foreground">
          {formatTokens(totalTokens)}
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
                const cell = b[t.key];
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
