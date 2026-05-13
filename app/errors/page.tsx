import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Errors' };
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface ErrorGroup {
  message: string;
  tool_name: string | null;
  occurrences: number;
  session_count: number;
  last_seen: string;
}

async function getData(page: number) {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return fetch(`${base}/api/errors?grouped=true&page=${page}&limit=50`, { cache: 'no-store' })
    .then((r) => r.json())
    .catch(() => ({ groups: [], total: 0, total_pages: 1 }));
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1'));
  const { groups, total, total_pages } = await getData(page);

  if (!total || total === 0) {
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
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {total} issue{total !== 1 ? 's' : ''}
              </CardTitle>
              {total_pages > 1 && (
                <span className="text-xs text-muted-foreground">
                  Page {page} of {total_pages}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(groups as ErrorGroup[]).map((group, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: 'rgba(239,68,68,0.05)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    borderLeft: '3px solid rgba(239,68,68,0.70)',
                  }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
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
                      <span className="text-[11px] font-medium" style={{ color: '#EF4444' }}>
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
