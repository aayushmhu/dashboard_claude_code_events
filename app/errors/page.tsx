import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Errors' };
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorTimeline } from '@/components/charts/error-timeline';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { formatRelativeTime, formatAbsoluteTime, truncateId } from '@/lib/utils';
import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

async function getData(page: number) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return fetch(`${base}/api/errors?page=${page}&limit=20`, { cache: 'no-store' }).then((r) =>
    r.json()
  );
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1'));
  const { errors, total, total_pages } = await getData(page);

  if (total === 0) {
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
      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Error Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorTimeline errors={errors} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {total} error{total !== 1 ? 's' : ''}
              </CardTitle>
              {total_pages > 1 && (
                <span className="text-xs text-muted-foreground">
                  Page {page} of {total_pages}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {errors.map(
                (err: {
                  id: number;
                  session_id: string;
                  timestamp: string;
                  tool_name: string | null;
                  error_message: string | null;
                  project_name: string;
                  project_dir: string;
                }) => (
                  <div
                    key={err.id}
                    className="flex gap-3 rounded-lg p-4 text-sm"
                    style={{
                      borderLeft: '3px solid #EF4444',
                      background: 'rgba(239,68,68,0.05)',
                      border: '1px solid rgba(239,68,68,0.20)',
                      borderLeftWidth: '3px',
                    }}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{err.tool_name || 'Unknown tool'}</span>
                        <span className="text-muted-foreground text-xs">in</span>
                        <span className="text-xs font-medium">{err.project_name}</span>
                        <Link
                          href={`/conversations?session=${err.session_id}`}
                          className="font-mono text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          {truncateId(err.session_id, 12)}
                        </Link>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground cursor-default ml-auto">
                              {formatRelativeTime(err.timestamp)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{formatAbsoluteTime(err.timestamp)}</TooltipContent>
                        </Tooltip>
                      </div>
                      {err.error_message && (
                        <p className="text-xs rounded p-2 font-mono" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}>
                          {err.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {total_pages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                {page > 1 && (
                  <a
                    href={`/errors?page=${page - 1}`}
                    className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    Previous
                  </a>
                )}
                {page < total_pages && (
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
      </div>
    </div>
  );
}
