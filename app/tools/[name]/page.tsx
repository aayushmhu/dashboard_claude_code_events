import { Header } from '@/components/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime, formatAbsoluteTime, truncateId } from '@/lib/utils';
import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

async function getData(name: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return fetch(`${base}/api/tools/${encodeURIComponent(name)}?limit=50`, {
    cache: 'no-store',
  }).then((r) => r.json());
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const calls = await getData(name);

  return (
    <div className="flex flex-col h-full">
      <Header title={`Tool: ${name}`} />
      <div className="flex-1 p-6 space-y-4">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Tools
        </Link>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {calls.length} recent call{calls.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {calls.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No calls found.</p>
            ) : (
              <div className="space-y-3">
                {calls.map(
                  (call: {
                    id: number;
                    session_id: string;
                    timestamp: string;
                    tool_input: Record<string, unknown> | null;
                    tool_output: Record<string, unknown> | null;
                    is_error: boolean;
                    error_message: string | null;
                    project_name: string;
                  }) => (
                    <div
                      key={call.id}
                      className={`rounded-lg border p-4 text-sm space-y-2 ${
                        call.is_error ? 'border-destructive/30 bg-destructive/5' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/conversations?session=${call.session_id}`}
                            className="font-mono text-xs text-muted-foreground hover:text-primary"
                          >
                            {truncateId(call.session_id, 12)}
                          </Link>
                          <Badge variant="muted">{call.project_name}</Badge>
                          {call.is_error && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Error
                            </Badge>
                          )}
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground cursor-default">
                              {formatRelativeTime(call.timestamp)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{formatAbsoluteTime(call.timestamp)}</TooltipContent>
                        </Tooltip>
                      </div>

                      {call.is_error && call.error_message && (
                        <p className="text-xs text-destructive">{call.error_message}</p>
                      )}

                      {call.tool_input && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Input
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-xs font-mono whitespace-pre-wrap">
                            {JSON.stringify(call.tool_input, null, 2).slice(0, 1000)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
