import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Dashboard' };
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityTimeline } from '@/components/charts/activity-timeline';
import { ToolUsageBar } from '@/components/charts/tool-usage-bar';
import { AgentDonut } from '@/components/charts/agent-donut';
import { ActivityHeatmap } from '@/components/charts/activity-heatmap';
import { SessionTable } from '@/components/session-table';
import {
  Activity,
  Layers,
  FolderOpen,
  AlertTriangle,
  Terminal,
  Monitor,
  Code2,
  Cpu,
} from 'lucide-react';
import { StatsOverview, TimelinePoint, ToolStats, AgentStats, Session, TokenTotals, ModelStats } from '@/lib/types';

interface EntrypointBreakdown { entrypoint: string; count: number; }
import { formatTokens, formatCost, calcCost, calcCacheSavings } from '@/lib/utils';
import Link from 'next/link';

async function getData() {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const [stats, timeline, tools, sessionsRes, agents, tokens, heatmap] = await Promise.all([
    fetch(`${base}/api/stats`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    fetch(`${base}/api/events/timeline?days=7`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    fetch(`${base}/api/tools`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    fetch(`${base}/api/sessions?limit=10`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ sessions: [] })),
    fetch(`${base}/api/agents`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
    fetch(`${base}/api/tokens`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ totals: null, by_model: [] })),
    fetch(`${base}/api/activity/heatmap`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
  ]);
  return { stats, timeline, tools, sessions: sessionsRes.sessions ?? [], agents, tokens, heatmap };
}

export default async function DashboardPage() {
  const { stats, timeline, tools, sessions, agents, tokens, heatmap } = (await getData()) as {
    stats: StatsOverview & { entrypoint_breakdown?: EntrypointBreakdown[] };
    timeline: TimelinePoint[];
    tools: ToolStats[];
    sessions: Session[];
    agents: AgentStats[];
    tokens: { totals: TokenTotals; by_model: ModelStats[] };
    heatmap: { day: string; count: number }[];
  };

  const safeStats: StatsOverview = {
    total_sessions: stats?.total_sessions ?? 0,
    total_events: stats?.total_events ?? 0,
    active_projects: stats?.active_projects ?? 0,
    error_rate: stats?.error_rate ?? 0,
  };
  const errorRateColor = safeStats.error_rate > 5 ? 'text-destructive' : undefined;
  const totals = tokens?.totals;
  const cacheSavings = totals ? calcCacheSavings(totals.cache_read_tokens) : 0;
  const topModel = tokens?.by_model?.find((m) => m.total_tokens > 0)?.model ?? null;
  const topModelShort = topModel ? topModel.replace('claude-', '').replace(/-\d{8}$/, '') : null;

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 sm:space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Total Sessions"
            value={safeStats.total_sessions}
            icon={Activity}
            description="All time"
          />
          <StatCard
            label="Total Events"
            value={safeStats.total_events.toLocaleString()}
            icon={Layers}
            description="All event types"
          />
          <StatCard
            label="Active Projects"
            value={safeStats.active_projects}
            icon={FolderOpen}
            description="Distinct project directories"
          />
          <StatCard
            label="Error Rate"
            value={`${safeStats.error_rate}%`}
            icon={AlertTriangle}
            description="of all events"
            valueClassName={errorRateColor}
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

              {/* Summary row */}
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

              {/* Cost-by-type breakdown */}
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

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Activity — Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline data={timeline} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tool Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <ToolUsageBar data={tools} />
            </CardContent>
          </Card>
        </div>

        {/* Activity heatmap */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity — Last 52 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap data={Array.isArray(heatmap) ? heatmap : []} />
          </CardContent>
        </Card>

        {/* Bottom row */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionTable sessions={sessions} hideTools />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Agent Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <AgentDonut data={agents} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
