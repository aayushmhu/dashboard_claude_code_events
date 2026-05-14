import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Errors' };
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Wrench, Globe, ArrowUpRight } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface ToolErrorGroup {
  message: string;
  tool_name: string | null;
  occurrences: number;
  session_count: number;
  last_seen: string;
}

interface ApiErrorGroup {
  code: string;
  url_path: string | null;
  occurrences: number;
  session_count: number;
  last_seen: string;
}

async function getData(page: number) {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return fetch(`${base}/api/errors?grouped=true&page=${page}&limit=50`, { cache: 'no-store' })
    .then((r) => r.json())
    .catch(() => ({ tool_groups: [], tool_total: 0, api_groups: [], api_total: 0, total_pages: 1 }));
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1'));
  const data = await getData(page);
  const toolGroups: ToolErrorGroup[] = data.tool_groups ?? data.groups ?? [];
  const apiGroups: ApiErrorGroup[]   = data.api_groups ?? [];
  const toolTotal = Number(data.tool_total ?? data.total ?? 0);
  const apiTotal  = Number(data.api_total ?? 0);
  const totalPages = Number(data.total_pages ?? 1);

  const grandTotal = toolTotal + apiTotal;

  // Combined empty state — only when there are zero of both
  if (grandTotal === 0) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Errors" />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 opacity-80" />
          <p className="text-lg font-medium">No errors recorded</p>
          <p className="text-sm text-muted-foreground">Everything&apos;s running smoothly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Errors" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 sm:space-y-6">
        {/* Summary row */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-xl font-semibold">
            {grandTotal} issue{grandTotal !== 1 ? 's' : ''}
          </h1>
          <span className="text-sm text-muted-foreground">
            {apiTotal > 0 && (
              <span>
                <span className="text-amber-400/90 font-medium">{apiTotal}</span> API
                {toolTotal > 0 && ' · '}
              </span>
            )}
            {toolTotal > 0 && (
              <span>
                <span className="text-rose-400/90 font-medium">{toolTotal}</span> tool
              </span>
            )}
          </span>
        </div>

        {/* API errors lane — different problem class, different remediation */}
        {apiTotal > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-amber-400" />
                  API errors
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-normal ml-1">
                    network · anthropic api
                  </span>
                </CardTitle>
                <span className="text-xs text-muted-foreground">{apiTotal} group{apiTotal !== 1 ? 's' : ''}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {apiGroups.map((group, i) => (
                  <div
                    key={`api-${i}`}
                    className="flex gap-3 rounded-lg px-4 py-3 text-sm border border-amber-500/20 bg-amber-500/[0.04]"
                    style={{ borderLeft: '3px solid rgba(245,158,11,0.65)' }}
                  >
                    <ArrowUpRight className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <p className="font-mono text-xs text-foreground/90 leading-relaxed">
                          {group.code}
                        </p>
                        <span className="text-xs text-muted-foreground/60 whitespace-nowrap shrink-0">
                          {formatRelativeTime(group.last_seen)}
                        </span>
                      </div>
                      {group.url_path && (
                        <p className="text-[11px] text-muted-foreground/70 font-mono truncate">
                          {group.url_path}
                        </p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-medium text-amber-400/90">
                          ×{group.occurrences}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          in {group.session_count} session{group.session_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {apiTotal > 0 && (
                <p className="text-[11px] text-muted-foreground/60 mt-3 pt-3 border-t border-border/40">
                  API errors usually mean network instability or temporary Anthropic API issues — different remediation than tool failures.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tool errors lane — existing red treatment */}
        {toolTotal > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-rose-400" />
                  Tool errors
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-normal ml-1">
                    failed tool calls
                  </span>
                </CardTitle>
                {totalPages > 1 && (
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {toolGroups.map((group, i) => (
                  <div
                    key={`tool-${i}`}
                    className="flex gap-3 rounded-lg px-4 py-3 text-sm border border-rose-500/18 bg-rose-500/[0.04]"
                    style={{ borderLeft: '3px solid rgba(244,63,94,0.65)' }}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <p className="font-mono text-xs break-words text-foreground/90 leading-relaxed">
                          {group.message.length > 200 ? group.message.slice(0, 200) + '…' : group.message}
                        </p>
                        <span className="text-xs text-muted-foreground/60 whitespace-nowrap shrink-0">
                          {formatRelativeTime(group.last_seen)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {group.tool_name && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Wrench className="h-3 w-3" />
                            {group.tool_name}
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-rose-400/90">
                          ×{group.occurrences}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          in {group.session_count} session{group.session_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex justify-center gap-2">
                  {page > 1 && (
                    <a
                      href={`/errors?page=${page - 1}`}
                      className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                    >
                      Previous
                    </a>
                  )}
                  {page < totalPages && (
                    <a
                      href={`/errors?page=${page + 1}`}
                      className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                    >
                      Next
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
