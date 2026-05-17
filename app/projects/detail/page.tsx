import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import {
  ArrowLeft,
  FolderOpen,
  Zap,
  AlertCircle,
  Clock,
  Coins,
  DollarSign,
  Wrench,
  Bot,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCost, formatTokens, formatDuration, formatRelativeTime, parseDbDate } from '@/lib/utils';
import { getAgentColor, getToolColor } from '@/lib/colors';
import type {
  ProjectDetailResponse,
} from '@/app/api/projects/detail/route';

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getProjectDetail(project: string): Promise<ProjectDetailResponse | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(
      `${base}/api/projects/detail?project=${encodeURIComponent(project)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}): Promise<Metadata> {
  const { project } = await searchParams;
  if (!project) return { title: 'Project Detail' };
  const name = project.split('/').pop() ?? project;
  return { title: `${name} · Project Detail · Claude Code Dashboard` };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatBand({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl border border-border bg-card">
      <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={`text-xl font-mono font-bold tabular-nums leading-none ${valueClass ?? ''}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProjectDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  if (!project) notFound();

  const data = await getProjectDetail(project);
  if (!data) notFound();

  const { header, top_tools, agent_activity, cost_breakdown, error_summary, recent_sessions } = data;

  return (
    <div className="flex flex-col h-full">
      <Header title="Project Detail" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-5 overflow-y-auto">

        {/* Back link */}
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All projects
        </Link>

        {/* Header band */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-bold text-foreground">{header.project_name}</h1>
            {header.error_count > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertCircle className="h-3 w-3" />
                {header.error_count} error{header.error_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate" title={header.project_dir}>
            {header.project_dir}
          </p>
          {header.last_seen && (
            <p className="text-xs text-muted-foreground">
              Last active {formatRelativeTime(header.last_seen)}
            </p>
          )}
        </div>

        {/* 4 stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBand
            label="Sessions"
            value={String(header.total_sessions)}
            icon={MessageSquare}
          />
          <StatBand
            label="Events"
            value={String(header.total_events)}
            icon={Zap}
          />
          <StatBand
            label="Tokens"
            value={header.total_tokens > 0 ? formatTokens(header.total_tokens) : '—'}
            icon={Coins}
          />
          <StatBand
            label="Total cost"
            value={header.total_cost > 0 ? formatCost(header.total_cost) : '—'}
            icon={DollarSign}
            valueClass="text-amber-400"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Top tools */}
          {top_tools.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  Top Tools
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Tool</th>
                        <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Calls</th>
                        <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top_tools.map((t) => {
                        const color = getToolColor(t.tool_name);
                        return (
                          <tr key={t.tool_name} className="border-b border-border/40 last:border-0">
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                  style={{ background: color }}
                                />
                                <span className="font-medium text-foreground/80">{t.tool_name}</span>
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                              {t.call_count.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {t.error_count > 0 ? (
                                <span className="text-destructive">{t.error_count}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agent activity */}
          {agent_activity.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  Agent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  {agent_activity.map((a) => {
                    const colors = getAgentColor(a.agent_name);
                    return (
                      <span
                        key={a.agent_name}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        {a.agent_name} (Agent)
                        {a.dispatch_count > 1 && (
                          <span className="opacity-70 font-normal">&times;{a.dispatch_count}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Cost breakdown */}
        {cost_breakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Cost by Model
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Model</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Input tokens</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Output tokens</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cost_breakdown.map((b) => (
                      <tr key={b.model_family} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2 font-medium capitalize text-foreground/80">{b.model_family}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                          {formatTokens(b.input_tokens)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                          {formatTokens(b.output_tokens)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-amber-400 tabular-nums">
                          {formatCost(b.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error summary */}
        {error_summary.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-destructive/60" />
                Errors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Tool</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Message</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Count</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {error_summary.map((e, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2 text-muted-foreground">
                          {e.tool_name ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-foreground/70 max-w-xs truncate" title={e.message}>
                          {e.message}
                        </td>
                        <td className="px-4 py-2 text-right text-destructive tabular-nums font-medium">
                          {e.occurrences}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatRelativeTime(e.last_seen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent sessions */}
        {recent_sessions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Recent Sessions
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  (last {recent_sessions.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Session</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Started</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Duration</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Events</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Cost</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_sessions.map((s) => {
                      const started = parseDbDate(s.started_at);
                      const startedStr = isNaN(started.getTime())
                        ? s.started_at
                        : started.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                      return (
                        <tr key={s.session_id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2">
                            <Link
                              href={`/conversations/${s.session_id}`}
                              className="font-mono text-primary/80 hover:text-primary transition-colors"
                            >
                              {s.session_id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{startedStr}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                            {formatDuration(s.duration_seconds)}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                            {s.event_count}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-amber-400 tabular-nums">
                            {s.total_cost > 0 ? formatCost(s.total_cost) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {s.error_count > 0 ? (
                              <span className="text-destructive">{s.error_count}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
