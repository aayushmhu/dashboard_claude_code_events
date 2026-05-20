import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Tokens' };
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenTimeline } from '@/components/charts/token-timeline';
import { ModelBreakdown } from '@/components/charts/model-breakdown';
import { CostBreakdown } from '@/components/charts/cost-breakdown';
import { ScopePicker } from '@/components/scope-picker';
import { Coins, Zap, DollarSign, Database, TrendingUp } from 'lucide-react';
import { formatTokens, formatCost, calcCost, formatCacheAnnotation, parseDbDate, toSqliteTimestamp } from '@/lib/utils';
import { TokenTotals, ProjectTokenStats, ModelStats, TokenTimelinePoint } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { Suspense } from 'react';

interface SearchParams {
  start?: string;
  end?: string;
  scope?: string;
}

// Hour/day windows for the quick scope chips. 'all' means no time filter.
const SCOPE_MS: Record<string, number | null> = {
  '1h':  60 * 60 * 1000,
  '5h':  5 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': null,
};

async function getData(sp: SearchParams) {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const params = new URLSearchParams();

  // Precedence: explicit start/end query params win over quick scope.
  // If neither is set, fall back to whatever scope is in the URL — or all-time.
  if (sp.start || sp.end) {
    if (sp.start) params.set('start', sp.start);
    if (sp.end)   params.set('end',   sp.end);
  } else if (sp.scope && sp.scope in SCOPE_MS && SCOPE_MS[sp.scope] !== null) {
    const ms = SCOPE_MS[sp.scope]!;
    params.set('start', toSqliteTimestamp(new Date(Date.now() - ms)));
  }
  const qs = params.toString() ? `?${params}` : '';

  const [stats, timeline] = await Promise.all([
    fetch(`${base}/api/tokens${qs}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch(`${base}/api/tokens/timeline?granularity=day${qs ? `&${params}` : ''}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
  ]);
  return {
    totals: stats.totals as TokenTotals,
    by_project: stats.by_project as ProjectTokenStats[],
    by_model: stats.by_model as ModelStats[],
    timeline: timeline as TokenTimelinePoint[],
  };
}

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = await getData(sp);
  // Active quick scope (when no custom date range is set).
  const activeScope = (sp.start || sp.end) ? '' : (sp.scope && sp.scope in SCOPE_MS ? sp.scope : 'all');
  const totals: TokenTotals = raw.totals ?? {
    input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0,
    total_tokens: 0, total_cost: 0, cache_efficiency: 0, first_event_at: null, last_event_at: null,
  };
  const by_project: ProjectTokenStats[] = raw.by_project ?? [];
  const by_model: ModelStats[] = raw.by_model ?? [];
  const timeline = raw.timeline ?? [];

  const hasData = totals.total_tokens > 0;

  // Cost forecast: extrapolate daily average to 30 days
  let forecastCard: React.ReactNode = null;
  if (totals?.first_event_at && totals?.last_event_at) {
    const firstDate = parseDbDate(totals.first_event_at);
    const lastDate = parseDbDate(totals.last_event_at);
    const daysElapsed = Math.max(1, differenceInDays(lastDate, firstDate) + 1);
    const dailyAvg = totals.total_cost / daysElapsed;
    const projected30 = dailyAvg * 30;
    forecastCard = daysElapsed >= 3 ? (
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
          <p className="text-xs text-muted-foreground">Projected / 30 days</p>
        </div>
        <p className="text-lg font-semibold text-amber-400">{formatCost(projected30)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatCost(dailyAvg)}/day avg · {daysElapsed}d of data
        </p>
      </div>
    ) : null;
  }

  const cacheAnnotation = formatCacheAnnotation(totals.cache_read_tokens, totals.total_cost, null);

  return (
    <div className="flex flex-col h-full">
      <Header title="Token Usage" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 sm:space-y-6 overflow-y-auto">

        {/* Unified scope picker: quick chips + "Custom…" popover for arbitrary ranges */}
        <Suspense fallback={null}>
          <ScopePicker
            current={activeScope}
            options={['1h', '5h', '24h', '7d', '30d', 'all']}
            clearDateRange
            customMode
          />
        </Suspense>

        {!hasData && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <Coins className="h-14 w-14 text-muted-foreground opacity-30" />
            <p className="text-lg font-medium">No token data for this period</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Try a different date range, or token counts will appear once Claude Code logs model responses.
            </p>
          </div>
        )}

        {hasData && (
        <>
        {/* Stat cards — single canonical "Cost" with cache annotation as secondary line */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
          <StatCard
            label="Cost"
            value={formatCost(totals.total_cost)}
            icon={DollarSign}
            description={cacheAnnotation ?? 'input + output + cache'}
          />
          <StatCard
            label="Cache Efficiency"
            value={`${totals.cache_efficiency}%`}
            icon={Database}
            description="cache reads / (cache reads + input)"
          />
          <StatCard
            label="Total Tokens"
            value={formatTokens(totals.total_tokens)}
            icon={Zap}
            description="input + output + cache"
          />
        </div>

        {/* Token breakdown — tokens + cost per type */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            { label: 'Input',       value: totals.input_tokens,       cost: calcCost(totals.input_tokens, 0, 0, 0, null),       color: 'text-blue-400',    rate: '$3/M' },
            { label: 'Output',      value: totals.output_tokens,      cost: calcCost(0, totals.output_tokens, 0, 0, null),      color: 'text-rose-400',    rate: '$15/M' },
            { label: 'Cache Write', value: totals.cache_write_tokens, cost: calcCost(0, 0, totals.cache_write_tokens, 0, null), color: 'text-amber-400',   rate: '$6/M' },
            { label: 'Cache Read',  value: totals.cache_read_tokens,  cost: calcCost(0, 0, 0, totals.cache_read_tokens, null),  color: 'text-emerald-400', rate: '$0.30/M' },
          ].map(({ label, value, cost, color, rate }) => (
            <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <span className="text-[10px] text-muted-foreground/40">{rate}</span>
              </div>
              <p className={`text-lg font-semibold ${color}`}>{formatTokens(value)}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{formatCost(cost)}</p>
            </div>
          ))}
        </div>

        {/* Forecast */}
        {forecastCard && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {forecastCard}
          </div>
        )}

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Token Usage Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenTimeline data={timeline} />
          </CardContent>
        </Card>

        {/* Model + Cost side by side */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Model Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {by_model.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No model data.</p>
              ) : (
                <ModelBreakdown data={by_model} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cost by Project</CardTitle>
            </CardHeader>
            <CardContent>
              {by_project.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No project data.</p>
              ) : (
                <CostBreakdown data={by_project} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Per-project table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Usage by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-3 pr-6 font-medium">Project</th>
                    <th className="pb-3 pr-6 font-medium text-right">Input</th>
                    <th className="pb-3 pr-6 font-medium text-right">Output</th>
                    <th className="pb-3 pr-6 font-medium text-right">Cache Read</th>
                    <th className="pb-3 pr-6 font-medium text-right">Total tokens</th>
                    <th className="pb-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {by_project.map((p) => {
                    const href = `/projects/detail?project=${encodeURIComponent(p.project_dir)}`;
                    return (
                      <tr key={p.project_dir} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 pr-6 font-medium">
                          <Link href={href} className="inline-flex items-center gap-1 text-foreground hover:text-primary transition-colors" title={p.project_dir}>
                            <span className="truncate">{p.project_name}</span>
                            <span className="opacity-0 group-hover:opacity-60 text-primary transition-opacity">&rarr;</span>
                          </Link>
                        </td>
                        <td className="py-3 pr-6 text-right text-muted-foreground"><Link href={href} className="block">{formatTokens(p.input_tokens)}</Link></td>
                        <td className="py-3 pr-6 text-right text-muted-foreground"><Link href={href} className="block">{formatTokens(p.output_tokens)}</Link></td>
                        <td className="py-3 pr-6 text-right text-emerald-400"><Link href={href} className="block">{formatTokens(p.cache_read_tokens)}</Link></td>
                        <td className="py-3 pr-6 text-right font-medium"><Link href={href} className="block">{formatTokens(p.total_tokens)}</Link></td>
                        <td className="py-3 text-right font-medium text-amber-400"><Link href={href} className="block">{formatCost(p.cost)}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pricing note */}
        <p className="text-xs text-muted-foreground/60 text-center pb-2">
          Cost = input + output + cache write + cache read (all dollars billed). Rates shown above are Sonnet defaults; Opus and Haiku are priced at their own rates per turn.
        </p>
        </>
        )}
      </div>
    </div>
  );
}
