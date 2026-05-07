import { Header } from '@/components/header';
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
} from 'lucide-react';
import { StatsOverview, TimelinePoint, ToolStats, AgentStats, Session, TokenTotals, ModelStats } from '@/lib/types';
import { formatTokens, formatCost } from '@/lib/utils';
import Link from 'next/link';

async function getData() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
    stats: StatsOverview;
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
  const topModel = tokens?.by_model?.find((m) => m.total_tokens > 0)?.model ?? null;
  const topModelShort = topModel ? topModel.replace('claude-', '').replace(/-\d{8}$/, '') : null;

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Token Usage</p>
                <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">View details →</span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Tokens</p>
                  <p className="text-lg font-semibold">{formatTokens(totals.total_tokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Estimated Cost</p>
                  <p className="text-lg font-semibold text-amber-400">{formatCost(totals.total_cost)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Cache Efficiency</p>
                  <p className="text-lg font-semibold text-emerald-400">{totals.cache_efficiency}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Input</p>
                  <p className="text-lg font-semibold text-blue-400">{formatTokens(totals.input_tokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Output</p>
                  <p className="text-lg font-semibold text-rose-400">{formatTokens(totals.output_tokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Model</p>
                  <p className="text-lg font-semibold truncate">{topModelShort ?? '—'}</p>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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
