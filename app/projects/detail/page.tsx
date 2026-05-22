import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import {
  Zap, AlertCircle, Clock, Coins, DollarSign, Wrench, MessageSquare, Bot,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCost, formatTokens, formatRelativeTime, parseDbDate } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { getToolColor, getAgentColor } from '@/lib/colors';
import type { ProjectDetailResponse } from '@/app/api/projects/detail/route';
import { CostByModel } from './cost-by-model';
import { CostTimeline } from './cost-timeline';
import { PathCopyButton } from './path-copy-button';
import { LocalFilesSection } from './local-files-section';
import { SessionTable } from '@/components/session-table';
import { PaginationInfo, PaginationLinks } from '@/components/pagination';
import type { Session } from '@/lib/types';

async function getProjectDetail(project: string): Promise<ProjectDetailResponse | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(`${base}/api/projects/detail?project=${encodeURIComponent(project)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getProjectSessions(project: string, page: number): Promise<{
  sessions: Session[]; total: number; total_pages: number; page: number;
}> {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const params = new URLSearchParams({ project, page: String(page), limit: '20' });
    const res = await fetch(`${base}/api/sessions?${params}`, { cache: 'no-store' });
    if (!res.ok) return { sessions: [], total: 0, total_pages: 0, page: 1 };
    return res.json();
  } catch { return { sessions: [], total: 0, total_pages: 0, page: 1 }; }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ project?: string }> }): Promise<Metadata> {
  const { project } = await searchParams;
  if (!project) return { title: 'Project Detail' };
  const name = project.split('/').pop() ?? project;
  return { title: `${name} · Project Detail · Claude Code Dashboard` };
}

function StatBand({ label, value, icon: Icon, valueClass }: {
  label: string; value: string; icon: React.ElementType; valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl border border-border bg-card">
      <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />{label}
      </span>
      <span className={`text-xl font-mono font-bold tabular-nums leading-none ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

export default async function ProjectDetailPage({
  searchParams,
}: { searchParams: Promise<{ project?: string; page?: string }> }) {
  const { project, page: pageParam } = await searchParams;
  if (!project) notFound();
  const page = Math.max(1, parseInt(pageParam || '1'));
  const [data, sessionsRes] = await Promise.all([
    getProjectDetail(project),
    getProjectSessions(project, page),
  ]);
  if (!data) notFound();
  const { header, top_tools, agent_activity, cost_breakdown, error_summary } = data;
  const { sessions, total: sessionsTotal, total_pages } = sessionsRes;

  return (
    <div className="flex flex-col h-full">
      <Header title={header.project_name} />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-5 overflow-y-auto">
        <div className="space-y-1.5">
          {header.error_count > 0 && (
            <div>
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertCircle className="h-3 w-3" />
                {header.error_count} error{header.error_count !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs text-muted-foreground font-mono truncate" title={header.project_dir}>{header.project_dir}</p>
            <PathCopyButton path={header.project_dir} />
          </div>
          <p className="text-xs text-muted-foreground">
            {header.first_seen ? `Active since ${format(parseDbDate(header.first_seen), 'MMM d, yyyy')}` : null}
            {header.first_seen && header.last_seen ? ' · ' : null}
            {header.last_seen ? `Last seen ${formatDistanceToNow(parseDbDate(header.last_seen), { addSuffix: true })}` : null}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBand label="Sessions" value={String(header.total_sessions)} icon={MessageSquare} />
          <StatBand label="User turns" value={String(header.user_turns)} icon={Zap} />
          <StatBand label="Tokens" value={header.total_tokens > 0 ? formatTokens(header.total_tokens) : '—'} icon={Coins} />
          <StatBand label="Cost" value={header.total_cost > 0 ? formatCost(header.total_cost) : '—'} icon={DollarSign} valueClass="text-amber-400" />
        </div>

        <CostTimeline project={header.project_dir} />
        <CostByModel rows={cost_breakdown} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Sessions</span>
              <span className="text-muted-foreground font-normal">({sessionsTotal})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2">
            {total_pages > 1 && (
              <div className="flex items-center justify-end mb-4">
                <PaginationInfo page={page} total_pages={total_pages} />
              </div>
            )}
            <SessionTable sessions={sessions} hideTools={true} showSessionId={true} />
            {total_pages > 1 && (
              <div className="mt-4 flex justify-center">
                <PaginationLinks
                  page={page}
                  total_pages={total_pages}
                  makeHref={(p) => {
                    const params = new URLSearchParams({ project, page: String(p) });
                    return `/projects/detail?${params}`;
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {(top_tools.length > 0 || agent_activity.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {top_tools.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />Top Tools
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
                                  <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                                  <span className="font-medium text-foreground/80">{t.tool_name}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{t.call_count.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {t.error_count > 0 ? <span className="text-destructive">{t.error_count}</span> : <span className="text-muted-foreground">0</span>}
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

            {agent_activity.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />Agents Used
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Agent</th>
                          <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Calls</th>
                          <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Tokens</th>
                          <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agent_activity.map((a) => {
                          const c = getAgentColor(a.agent_name);
                          return (
                            <tr key={a.agent_name} className="border-b border-border/40 last:border-0">
                              <td className="px-4 py-2">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                                  style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                                  <Bot className="h-3 w-3" style={{ color: c.text }} />
                                  {a.agent_name}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{a.dispatch_count.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                                {a.total_tokens > 0 ? formatTokens(a.total_tokens) : '—'}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-mono text-amber-400/80">
                                {a.cost > 0 ? formatCost(a.cost) : '—'}
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
        )}

        {error_summary.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-destructive/60" />Errors
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground">Message</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Count</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">When</th>
                      <th className="px-4 pb-2 pt-0 font-medium text-muted-foreground text-right">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {error_summary.map((e, i) => {
                      const toolColor = e.tool_name ? getToolColor(e.tool_name) : null;
                      return (
                        <tr key={i} className="border-b border-border/40 last:border-0">
                          <td className="px-4 py-2 max-w-xs">
                            <span className="flex items-start gap-1.5">
                              {e.tool_name && toolColor && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 mt-px"
                                  style={{ background: `${toolColor}15`, color: toolColor, border: `1px solid ${toolColor}55` }}>
                                  {e.tool_name}
                                </span>
                              )}
                              <span className="text-foreground/70 truncate" title={e.message}>{e.message}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-destructive tabular-nums font-medium">{e.occurrences}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap">{formatRelativeTime(e.last_seen)}</td>
                          <td className="px-4 py-2 text-right">
                            {e.session_id ? (
                              <Link href={`/conversations/${e.session_id}`} className="font-mono text-primary/70 hover:text-primary transition-colors text-[11px]">
                                &rarr; {e.session_id.slice(0, 7)}
                              </Link>
                            ) : <span className="text-muted-foreground">—</span>}
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

        <LocalFilesSection project={project} />
      </div>
    </div>
  );
}
