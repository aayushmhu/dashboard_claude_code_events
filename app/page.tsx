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
  Wrench,
  FolderOpen,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { StatsOverview, Session, TokenTotals, ModelStats } from '@/lib/types';
import { SparklineCard } from '@/components/charts/sparkline-card';
import { HeroChart } from '@/components/charts/hero-chart';
import { BudgetPanel } from '@/components/budget-panel';
import { RecommendationsSection } from '@/components/recommendations-section';
import { ScopePicker } from '@/components/scope-picker';

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

import { formatCost, formatTokens, calcCost, formatCacheAnnotation, toSqliteTimestamp } from '@/lib/utils';
import Link from 'next/link';

interface Insight {
  id: string;
  title: string;
  body: string;
  saving?: string;
  type: 'cost' | 'cache' | 'pattern';
}
interface InsightThresholds {
  opus_min_turns: number;
  opus_min_cost: number;
  agent_min_calls: number;
  agent_min_avg_input: number;
  agent_max_cache_ratio: number;
  edit_retries_min_sessions: number;
  edit_retries_min_per_session: number;
  long_tool_min_calls: number;
  long_tool_min_duration_ms: number;
  cost_spike_ratio: number;
  cost_spike_min_baseline: number;
  opus_verbose_min_turns: number;
  opus_verbose_ratio: number;
  read_thrash_min_per_session: number;
  read_thrash_min_sessions: number;
  cache_write_no_read_min_sessions: number;
  retry_loop_min_sessions: number;
  retry_loop_min_consecutive: number;
  no_caching_min_sessions: number;
  no_caching_min_input: number;
  subagent_explosion_min_sessions: number;
  subagent_explosion_min_calls: number;
  volume_spike_ratio: number;
  volume_spike_min_baseline: number;
  high_error_min_sessions: number;
  high_error_min_tool_calls: number;
  high_error_rate_threshold: number;
  opus_research_min_sessions: number;
  opus_research_min_tools: number;
  opus_small_min_turns: number;
}
interface DigestData {
  week_cost: number;
  prev_week_cost: number;
  week_sessions: number;
  cache_efficiency: number;
  top_tools: { name: string; uses: number }[];
  top_projects: { name: string; cost: number }[];
}

// Window length in milliseconds, keyed by scope. Hour-based scopes for active
// monitoring; day-based for retrospective.
const SCOPE_MS: Record<string, number> = {
  '1h':  60 * 60 * 1000,
  '5h':  5 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const SCOPE_LABELS: Record<string, { full: string; short: string; title: string }> = {
  '1h':  { full: 'last 1 hour',   short: '1h',  title: 'Last 1h'        },
  '5h':  { full: 'last 5 hours',  short: '5h',  title: 'Last 5h'        },
  '24h': { full: 'last 24 hours', short: '24h', title: 'Last 24h'       },
  '7d':  { full: 'last 7 days',   short: '7d',  title: 'Last 7 days'    },
  '30d': { full: 'last 30 days',  short: '30d', title: 'Last 30 days'   },
  'all': { full: 'all time',      short: 'all', title: 'All time'       },
};

async function getData(scopeKey: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const windowMs = SCOPE_MS[scopeKey];
  const tokensUrl = windowMs
    ? `${base}/api/tokens?start=${encodeURIComponent(toSqliteTimestamp(new Date(Date.now() - windowMs)))}`
    : `${base}/api/tokens`;
  const [stats, sessionsRes, tokens, heatmap, insights, settings] = await Promise.all([
    fetch(`${base}/api/stats?scope=${scopeKey}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch(`${base}/api/sessions?limit=10`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ sessions: [] })),
    fetch(tokensUrl, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ totals: null, by_model: [] })),
    fetch(`${base}/api/activity/heatmap`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    fetch(`${base}/api/insights`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ insights: [], digest: null })),
    fetch(`${base}/api/settings`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
  ]);
  return { stats, sessions: sessionsRes.sessions ?? [], tokens, heatmap, insights, settings };
}

interface SearchParams { scope?: string }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const scopeKey = (sp.scope && SCOPE_LABELS[sp.scope]) ? sp.scope : '24h';
  const scopeLabel = SCOPE_LABELS[scopeKey].full;
  const scopeShort = SCOPE_LABELS[scopeKey].short;
  const scopeTitle = SCOPE_LABELS[scopeKey].title;

  const { stats, sessions, tokens, heatmap, insights: insightsData, settings } = (await getData(scopeKey)) as {
    stats: StatsOverview & {
      entrypoint_breakdown?: EntrypointBreakdown[];
      today?: TodayStats;
      yesterday?: YesterdayStats;
      week_sparkline?: WeekSparklinePoint[];
      prev_week_total?: { events: number; errors: number; tool_calls: number };
    };
    sessions: Session[];
    tokens: { totals: TokenTotals; by_model: ModelStats[] };
    heatmap: { day: string; count: number }[];
    insights: { insights: Insight[]; digest: DigestData | null; thresholds?: InsightThresholds; threshold_defaults?: InsightThresholds };
    settings: Record<string, string>;
  };
  const insightsList: Insight[] = insightsData?.insights ?? [];
  const digest: DigestData | null = insightsData?.digest ?? null;
  const thresholds = insightsData?.thresholds ?? null;
  const thresholdDefaults = insightsData?.threshold_defaults ?? null;
  const budgetRaw = settings?.budget_daily_usd;
  const budget = budgetRaw ? parseFloat(budgetRaw) : null;

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
  const cacheAnnotation = totals ? formatCacheAnnotation(totals.cache_read_tokens, totals.total_cost, null) : null;
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
    const up = todayErrNum >= yesterdayErrNum;
    errorTrend = `${up ? '↑' : '↓'} from ${yesterdayErrorRate}% yesterday`;
    errorTrendPositive = !up;
  }

  void todayEvents;

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 sm:space-y-6">

        {/* Narrative sentence + scope picker + budget */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-semibold">
              {scopeTitle}: {today.sessions} session{today.sessions !== 1 ? 's' : ''}
              {today.cost > 0 ? ` · ${formatCost(today.cost)} spent` : ''}
              {today.errors > 0 ? ` · ${today.errors} error${today.errors !== 1 ? 's' : ''}` : ''}
            </h1>
            <ScopePicker current={scopeKey} options={['1h', '5h', '24h', '7d', '30d', 'all']} />
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {scopeLabel} · all numbers below obey this scope unless self-labeled
          </p>
          <BudgetPanel todayCost={today.cost} budget={budget} />
        </div>

        {/* Sparkline cards */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <SparklineCard
            label="Spend"
            value={formatCost(today.cost)}
            subtitle={`${scopeShort} window · 7-day sparkline`}
            trend={scopeKey === '24h' ? spendTrend : undefined}
            trendPositive={scopeKey === '24h' ? spendTrendPositive : undefined}
            data={weekSparkline.map((d) => ({ v: d.cost }))}
            color="#F59E0B"
          />
          <SparklineCard
            label="Cache Efficiency"
            value={`${latestCacheEfficiency}%`}
            subtitle={cacheAnnotation ?? 'no cache hits yet'}
            data={weekSparkline.map((d) => ({ v: d.cache_efficiency }))}
            color="#10B981"
          />
          <SparklineCard
            label="Error Rate"
            value={`${todayErrorRate}%`}
            trend={scopeKey === '24h' ? errorTrend : undefined}
            trendPositive={scopeKey === '24h' ? errorTrendPositive : undefined}
            data={weekSparkline.map((d) => ({
              v: d.events > 0 ? Math.round(d.errors / d.events * 1000) / 10 : 0,
            }))}
            color="#EF4444"
          />
        </div>

        {/* Weekly digest — self-labeled, ignores page scope on purpose (week-over-week comparison) */}
        {digest && (
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <div className="flex items-baseline justify-between gap-2 mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Week</p>
              <p className="text-[10px] text-muted-foreground/60">Week over week · independent of page scope</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cost</p>
                <p className="text-xl font-semibold text-amber-400">{formatCost(digest.week_cost)}</p>
                {digest.prev_week_cost > 0 && (() => {
                  const pct = ((digest.week_cost - digest.prev_week_cost) / digest.prev_week_cost * 100);
                  const up = pct >= 0;
                  return (
                    <p className={`text-[11px] flex items-center gap-0.5 mt-0.5 ${up ? 'text-red-400' : 'text-emerald-400'}`}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(pct).toFixed(0)}% vs last week
                    </p>
                  );
                })()}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sessions</p>
                <p className="text-xl font-semibold">{digest.week_sessions}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cache efficiency</p>
                <p className="text-xl font-semibold text-emerald-400">{digest.cache_efficiency}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Previous week</p>
                <p className="text-xl font-semibold text-muted-foreground">{formatCost(digest.prev_week_cost)}</p>
              </div>
            </div>
            {(digest.top_tools.length > 0 || digest.top_projects.length > 0) && (
              <div className="border-t border-border/40 mt-4 pt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {digest.top_tools.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground/70 mb-2 flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" />Top tools
                    </p>
                    <div className="space-y-1">
                      {digest.top_tools.map((t) => (
                        <div key={t.name} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-mono">{t.name}</span>
                          <span className="font-medium">{t.uses.toLocaleString()} uses</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {digest.top_projects.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground/70 mb-2 flex items-center gap-1.5">
                      <FolderOpen className="h-3 w-3" />Top projects
                    </p>
                    <div className="space-y-1">
                      {digest.top_projects.map((p) => (
                        <div key={p.name} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate max-w-[60%]">{p.name}</span>
                          <span className="font-medium text-amber-400">{formatCost(p.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Token summary — scoped to the page's selected window */}
        {totals && totals.total_tokens > 0 && (
          <Link href="/tokens" className="block group">
            <div className="rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token Usage · {scopeShort}</p>
                <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">View all-time on /tokens →</span>
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Cost</p>
                  <p className="text-xl font-semibold text-amber-400">{formatCost(totals.total_cost)}</p>
                  {cacheAnnotation && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{cacheAnnotation}</p>
                  )}
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
                  { label: 'Input',       tokens: totals.input_tokens,        cost: calcCost(totals.input_tokens, 0, 0, 0, null),        rate: '$3/M',    color: 'text-blue-400' },
                  { label: 'Output',      tokens: totals.output_tokens,       cost: calcCost(0, totals.output_tokens, 0, 0, null),       rate: '$15/M',   color: 'text-rose-400' },
                  { label: 'Cache Write', tokens: totals.cache_write_tokens,  cost: calcCost(0, 0, totals.cache_write_tokens, 0, null),  rate: '$6/M', color: 'text-amber-400' },
                  { label: 'Cache Read',  tokens: totals.cache_read_tokens,   cost: calcCost(0, 0, 0, totals.cache_read_tokens, null),   rate: '$0.30/M', color: 'text-emerald-400' },
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

        {/* Hero chart — title + delta live inside the chart component now */}
        <Card>
          <CardContent className="pt-5">
            <HeroChart data={weekSparkline} prevWeekTotal={stats?.prev_week_total} />
          </CardContent>
        </Card>

        {/* Recommendations — between hero chart and heatmap so insights surface alongside the activity picture */}
        {thresholds && thresholdDefaults && (
          <RecommendationsSection
            insights={insightsList}
            thresholds={thresholds}
            defaults={thresholdDefaults}
          />
        )}

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
