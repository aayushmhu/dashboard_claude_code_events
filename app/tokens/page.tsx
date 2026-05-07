import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TokenTimeline } from '@/components/charts/token-timeline';
import { ModelBreakdown } from '@/components/charts/model-breakdown';
import { CostBreakdown } from '@/components/charts/cost-breakdown';
import { DateRangePicker } from '@/components/date-range-picker';
import { Coins, Zap, DollarSign, Database, TrendingUp, Sparkles } from 'lucide-react';
import { formatTokens, formatCost, calcCacheSavings, parseDbDate } from '@/lib/utils';
import { TokenTotals, ProjectTokenStats, ModelStats, TokenTimelinePoint } from '@/lib/types';
import { differenceInDays } from 'date-fns';
import { Suspense } from 'react';

interface SearchParams {
  start?: string;
  end?: string;
}

async function getData(sp: SearchParams) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const params = new URLSearchParams();
  if (sp.start) params.set('start', sp.start);
  if (sp.end) params.set('end', sp.end);
  const qs = params.toString() ? `?${params}` : '';

  const [stats, timeline] = await Promise.all([
    fetch(`${base}/api/tokens${qs}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${base}/api/tokens/timeline?granularity=day${qs ? `&${params}` : ''}`, { cache: 'no-store' }).then((r) => r.json()),
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
  const { totals, by_project, by_model, timeline } = await getData(sp);

  const hasData = totals?.total_tokens > 0;

  // Cost forecast: extrapolate daily average to 30 days
  let forecastCard: React.ReactNode = null;
  if (totals.first_event_at && totals.last_event_at) {
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

  // Cache savings
  const cacheSavings = calcCacheSavings(totals.cache_read_tokens);
  const cacheSavingsCard = cacheSavings > 0 ? (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
        <p className="text-xs text-muted-foreground">Cache savings</p>
      </div>
      <p className="text-lg font-semibold text-emerald-400">{formatCost(cacheSavings)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {formatTokens(totals.cache_read_tokens)} cache reads at $0.30/M vs $3.00/M
      </p>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full">
      <Header title="Token Usage" />
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">

        {/* Date range picker — always visible so user can change filter and refresh */}
        <Suspense fallback={null}>
          <DateRangePicker />
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
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Tokens"
            value={formatTokens(totals.total_tokens)}
            icon={Zap}
          />
          <StatCard
            label="Estimated Cost"
            value={formatCost(totals.total_cost)}
            icon={DollarSign}
          />
          <StatCard
            label="Cache Efficiency"
            value={`${totals.cache_efficiency}%`}
            icon={Database}
            description="cache reads / (cache reads + input)"
          />
          <StatCard
            label="Output Tokens"
            value={formatTokens(totals.output_tokens)}
            icon={Coins}
          />
        </div>

        {/* Token breakdown strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Input', value: totals.input_tokens, color: 'text-blue-400' },
            { label: 'Output', value: totals.output_tokens, color: 'text-rose-400' },
            { label: 'Cache Write', value: totals.cache_write_tokens, color: 'text-amber-400' },
            { label: 'Cache Read', value: totals.cache_read_tokens, color: 'text-emerald-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={`text-lg font-semibold ${color}`}>{formatTokens(value)}</p>
            </div>
          ))}
        </div>

        {/* Forecast + cache savings */}
        {(forecastCard || cacheSavingsCard) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {forecastCard}
            {cacheSavingsCard}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    <th className="pb-3 pr-6 font-medium text-right">Total</th>
                    <th className="pb-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {by_project.map((p) => (
                    <tr key={p.project_dir} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-6 font-medium">{p.project_name}</td>
                      <td className="py-3 pr-6 text-right text-muted-foreground">{formatTokens(p.input_tokens)}</td>
                      <td className="py-3 pr-6 text-right text-muted-foreground">{formatTokens(p.output_tokens)}</td>
                      <td className="py-3 pr-6 text-right text-emerald-400">{formatTokens(p.cache_read_tokens)}</td>
                      <td className="py-3 pr-6 text-right font-medium">{formatTokens(p.total_tokens)}</td>
                      <td className="py-3 text-right font-medium text-amber-400">{formatCost(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pricing note */}
        <p className="text-xs text-muted-foreground/60 text-center pb-2">
          Pricing: input $3/M · output $15/M · cache write $3.75/M · cache read $0.30/M (Sonnet rates)
        </p>
        </>
        )}
      </div>
    </div>
  );
}
