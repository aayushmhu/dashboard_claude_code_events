import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Dashboard' };
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityHeatmap } from '@/components/charts/activity-heatmap';
import { SessionTable } from '@/components/session-table';
import {
  Monitor,
  Code2,
  Terminal,
  Cpu,
} from 'lucide-react';
import { StatsOverview, Session, TokenTotals, ModelStats } from '@/lib/types';
import { SparklineCard } from '@/components/charts/sparkline-card';
import { HeroChart } from '@/components/charts/hero-chart';

interface EntrypointBreakdown { entrypoint: string; count: number; }
interface TodayStats { sessions: number; cost: number; errors: number; }
interface YesterdayStats { cost: number; errors: number; events: number; }
interface WeekSparklinePoint {
  day: string;
  cost: number;
  events: number;
  errors: number;
  tool_calls: number;
  cache_efficiency: number;
}

import { formatCost, calcCacheSavings, formatTokens, calcCost } from '@/lib/utils';
import Link from 'next/link';

async function getData() {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const [stats, sessionsRes, tokens, heatmap] = await Promise.all([
    fetch(`${base}/api/stats`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch(`${base}/api/sessions?limit=10`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ sessions: [] })),
    fetch(`${base}/api/tokens`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ totals: null, by_model: [] })),
    fetch(`${base}/api/activity/heatmap`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
  ]);
  return { stats, sessions: sessionsRes.sessions ?? [], tokens, heatmap };
}

export default async function DashboardPage() {
  const { stats, sessions, tokens, heatmap } = (await getData()) as {
    stats: StatsOverview & {
      entrypoint_breakdown?: EntrypointBreakdown[];
      today?: TodayStats;
      yesterday?: YesterdayStats;
      week_sparkline?: WeekSparklinePoint[];
    };
    sessions: Session[];
    tokens: { totals: TokenTotals; by_model: ModelStats[] };
    heatmap: { day: string; count: number }[];
  };

  const safeStats: StatsOverview = {
    total_sessions: stats?.total_sessions ?? 0,
    total_events: stats?.total_events ?? 0,
    active_projects: stats?.active_projects ?? 0,
    error_rate: stats?.error_rate ?? 0,
  };

  const today: TodayStats = stats?.today ?? { sessions: 0, cost: 0, errors: 0 };
  const yesterday: YesterdayStats = stats?.yesterday ?? { cost: 0, errors: 0, events: 0 };
  const weekSparkline: WeekSparklinePoint[] = stats?.week_sparkline ?? [];

  const totals = tokens?.totals;
  const cacheSavings = totals ? calcCacheSavings(totals.cache_read_tokens) : 0;
  const topModel = tokens?.by_model?.find((m) => m.total_tokens > 0)?.model ?? null;
  const topModelShort = topModel ? topModel.replace('claude-', '').replace(/-\d{8}$/, '') : null;

  const latestDayWithData = weekSparkline.filter((d) => d.events > 0).slice(-1)[0];
  const latestCacheEfficiency = latestDayWithData ? latestDayWithData.cache_efficiency.toFixed(1) : '0.0';

  const todayEvents = weekSparkline.find((d) => d.errors !== undefined)
    ? weekSparkline.reduce((sum, d) => sum + d.events, 0)
    : 0;
  const todayErrorEvents = today.errors;
  const todayTotalEvents = weekSparkline[weekSparkline.length - 1]?.events ?? 0;
  const todayErrorRate = todayTotalEvents > 0
    ? (todayErrorEvents / todayTotalEvents * 100).toFixed(1)
    : '0.0';

  const yesterdayErrorRate = yesterday.events > 0
    ? (Number(yesterday.errors) / Number(yesterday.events) * 100).toFixed(1)
    : '0.0';

  let spendTrend: string | undefined;
  let spendTrendPositive: boolean | undefined;
  if (yesterday.cost > 0) {
    const pct = ((today.cost - yesterday.cost) / yesterday.cost * 100).toFixed(0);
    const up = today.cost >= yesterday.cost;
    spendTrend = `${up ? '↑' : '↓'} ${Math.abs(Number(pct))}% from yesterday`;
    spendTrendPositive = !up;
  }

  let errorTrend: string | undefined;
  let errorTrendPositive: boolean | undefined;
  const todayErrNum = Number(todayErrorRate);
  const yesterdayErrNum = Number(yesterdayErrorRate);
  if (yesterday.events > 0) {
    const diff = (todayErrNum - yesterdayErrNum).toFixed(1);
    const up = todayErrNum >= yesterdayErrNum;
    errorTrend = `${up ? '↑' : '↓'} from ${yesterdayErrorRate}% yesterday`;
    errorTrendPositive = !up;
  }

  void todayEvents;

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 sm:space-y-6">

        {/* Narrative sentence */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-xl font-semibold">
            Last 24h: {today.sessions} session{today.sessions !== 1 ? 's' : ''}
            {today.cost > 0 ? ` · ${formatCost(today.cost)} spent` : ''}
            {today.errors > 0 ? ` · ${today.errors} error${today.errors !== 1 ? 's' : ''}` : ''}
          </h1>
          <span className="text-sm text-muted-foreground">
            All time: {safeStats.total_sessions} sessions · {formatCost(totals?.total_cost ?? 0)}
          </span>
        </div>

        {/* Sparkline cards */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <SparklineCard
            label="Spend"
            value={formatCost(today.cost)}
            subtitle={`${formatCost(totals?.total_cost ?? 0)} all time`}
            trend={spendTrend}
            trendPositive={spendTrendPositive}
            data={weekSparkline.map((d) => ({ v: d.cost }))}
            color="#F59E0B"
          />
          <SparklineCard
            label="Cache Efficiency"
            value={`${latestCacheEfficiency}%`}
            subtitle={`saved ${formatCost(cacheSavings)} all time`}
            data={weekSparkline.map((d) => ({ v: d.cache_efficiency }))}
            color="#10B981"
          />
          <SparklineCard
            label="Error Rate"
            value={`${todayErrorRate}%`}
            trend={errorTrend}
            trendPositive={errorTrendPositive}
            data={weekSparkline.map((d) => ({
              v: d.events > 0 ? Math.round(d.errors / d.events * 1000) / 10 : 0,
            }))}
            color="#EF4444"
          />
        </div>

        {/* Token summary */}
        {totals && totals.total_tokens > 0 && (
          <Link href="/tokens" className="block group">
            <div className="rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token Usage</p>
                <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">View details →</span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Cost</p>
                  <p className="text-xl font-semibold text-amber-400">{formatCost(totals.total_cost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Cache Savings</p>
                  <p className="text-xl font-semibold text-emerald-400">{formatCost(cacheSavings)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Cache Efficiency</p>
                  <p className="text-xl font-semibold text-emerald-400">{totals.cache_efficiency}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Top Model</p>
                  <p className="text-xl font-semibold truncate">{topModelShort ?? '—'}</p>
                </div>
              </div>

              <div className="border-t border-border/40 pt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {[
                  { label: 'Input',       tokens: totals.input_tokens,        cost: calcCost(totals.input_tokens, 0, 0, 0),        rate: '$3/M',    color: 'text-blue-400' },
                  { label: 'Output',      tokens: totals.output_tokens,       cost: calcCost(0, totals.output_tokens, 0, 0),       rate: '$15/M',   color: 'text-rose-400' },
                  { label: 'Cache Write', tokens: totals.cache_write_tokens,  cost: calcCost(0, 0, totals.cache_write_tokens, 0),  rate: '$3.75/M', color: 'text-amber-400' },
                  { label: 'Cache Read',  tokens: totals.cache_read_tokens,   cost: calcCost(0, 0, 0, totals.cache_read_tokens),   rate: '$0.30/M', color: 'text-emerald-400' },
                ].map(({ label, tokens, cost, rate, color }) => (
                  <div key={label}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <span className="text-[10px] text-muted-foreground/40">{rate}</span>
                    </div>
                    <p className={`text-sm font-semibold ${color}`}>{formatTokens(tokens)}</p>
                    <p className="text-xs text-muted-foreground/60">{formatCost(cost)}</p>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        )}

        {/* Workspace insight strip */}
        {(() => {
          const epBreakdown = stats?.entrypoint_breakdown ?? [];
          const epTotal = epBreakdown.reduce((s, r) => s + r.count, 0);
          const topModels = (tokens?.by_model ?? []).filter(m => m.total_tokens > 0).slice(0, 3);
          const modelTotal = topModels.reduce((s, m) => s + m.total_tokens, 0);
          if (epTotal === 0 && topModels.length === 0) return null;

          const epIcon = (ep: string) => ep === 'vscode' ? <Monitor className="h-3 w-3" /> : ep === 'sdk' || ep === 'sdk-cli' ? <Code2 className="h-3 w-3" /> : <Terminal className="h-3 w-3" />;
          const epLabel = (ep: string) => ep === 'vscode' ? 'VS Code' : ep === 'sdk' || ep === 'sdk-cli' ? 'SDK' : 'CLI';

          return (
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Workspace</p>
              <div className="flex flex-col sm:flex-row gap-4">
                {epTotal > 0 && (
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground/70 mb-2">Entrypoint</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {epBreakdown.map(r => (
                        <span key={r.entrypoint} className="flex items-center gap-1 text-xs text-muted-foreground">
                          {epIcon(r.entrypoint)}
                          <span>{epLabel(r.entrypoint)}</span>
                          <span className="font-medium text-foreground">{r.count}</span>
                          <span className="text-muted-foreground/50">({Math.round(r.count / epTotal * 100)}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {topModels.length > 0 && (
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground/70 mb-2">Models</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      {topModels.map(m => (
                        <span key={m.model} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Cpu className="h-3 w-3" />
                          <span>{m.model.replace('claude-', '').replace(/-\d{8}$/, '')}</span>
                          <span className="font-medium text-foreground">{Math.round(m.total_tokens / modelTotal * 100)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Hero chart — Activity Last 7 Days */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <HeroChart data={weekSparkline} />
          </CardContent>
        </Card>

        {/* Activity heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity — Last 52 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap data={Array.isArray(heatmap) ? heatmap : []} />
          </CardContent>
        </Card>

        {/* Recent Sessions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionTable sessions={sessions} hideTools />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
