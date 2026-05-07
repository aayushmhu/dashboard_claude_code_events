'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Session } from '@/lib/types';
import { formatRelativeTime, formatAbsoluteTime, formatDuration, truncateId } from '@/lib/utils';
import { Copy, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useState } from 'react';

interface SessionTableProps {
  sessions: Session[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <Copy className={`h-3 w-3 ${copied ? 'text-primary' : 'text-muted-foreground'}`} />
    </button>
  );
}

export function SessionTable({ sessions }: SessionTableProps) {
  const router = useRouter();

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No sessions found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Session</th>
            <th className="pb-3 pr-4 font-medium">Project</th>
            <th className="pb-3 pr-4 font-medium">Started</th>
            <th className="pb-3 pr-4 font-medium">Duration</th>
            <th className="pb-3 pr-4 font-medium">Events</th>
            <th className="pb-3 pr-4 font-medium">Tools</th>
            <th className="pb-3 font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.session_id}
              onClick={() => router.push(`/conversations?session=${session.session_id}`)}
              className="group border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
            >
                <td className="py-3 pr-4">
                  <div className="flex items-center font-mono text-xs">
                    {truncateId(session.session_id, 12)}
                    <CopyButton text={session.session_id} />
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className="font-medium">{session.project_name || '—'}</span>
                </td>
                <td className="py-3 pr-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-default">
                        {formatRelativeTime(session.started_at)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{formatAbsoluteTime(session.started_at)}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatDuration(session.duration_seconds)}
                </td>
                <td className="py-3 pr-4">{session.event_count}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {session.tools_used?.slice(0, 3).map((tool) => (
                      <Badge key={tool} variant="muted" className="text-xs">
                        {tool}
                      </Badge>
                    ))}
                    {session.tools_used?.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{session.tools_used.length - 3}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-3">
                  {session.error_count > 0 ? (
                    <span className="flex items-center gap-1 text-destructive text-xs font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {session.error_count}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
