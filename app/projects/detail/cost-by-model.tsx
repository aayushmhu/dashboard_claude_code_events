'use client';

import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CostMixRow, CostMixBar, breakdownFor } from '@/components/cost-mix-row';
import { formatTokens, formatCost } from '@/lib/utils';
import { TOKEN_COLORS } from '@/lib/colors';
import type { ProjectDetailCostBreakdown } from '@/app/api/projects/detail/route';

export function CostByModel({ rows }: { rows: ProjectDetailCostBreakdown[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) return null;

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const aggregate = rows.reduce(
    (acc, r) => {
      const rowData = { ...r, name: r.model_family, model: r.model_family };
      const b = breakdownFor(rowData);
      return {
        totalTokens: acc.totalTokens + r.input_tokens + r.output_tokens + r.cache_write_tokens + r.cache_read_tokens,
        totalCost:   acc.totalCost   + r.cost,
        input:       acc.input       + b.input.cost,
        output:      acc.output      + b.output.cost,
        cacheWrite:  acc.cacheWrite  + b.cacheWrite.cost,
        cacheRead:   acc.cacheRead   + b.cacheRead.cost,
      };
    },
    { totalTokens: 0, totalCost: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          Cost by Model
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
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
              {rows.map((r) => (
                <CostMixRow
                  key={r.model_family}
                  row={{ ...r, name: r.model_family, model: r.model_family }}
                  isOpen={expanded.has(r.model_family)}
                  onToggle={() => toggle(r.model_family)}
                />
              ))}
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
                <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">
                  {formatCost(aggregate.totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
