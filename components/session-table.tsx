'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Session } from '@/lib/types';
import { formatRelativeTime, formatAbsoluteTime, formatDuration, truncateId, formatTokens } from '@/lib/utils';
import { getToolColor } from '@/lib/colors';
import { Copy, AlertCircle, ExternalLink, Check } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useState } from 'react';

interface SessionTableProps {
  sessions: Session[];
  hideTools?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied
        ? <Check className="h-3 w-3 text-emerald-400" />
        : <Copy className="h-3 w-3 text-muted-foreground" />
      }
    </button>
  );
}

export function SessionTable({ sessions, hideTools = false }: SessionTableProps) {
  const router = useRouter();

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <p className="text-sm">No sessions found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm min-w-[320px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground/60">
            {/* sm+: session id */}
            <th className="hidden sm:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Session</th>
            {/* always */}
            <th className="pb-3 pr-4 font-medium uppercase tracking-wide">Project</th>
            <th className="pb-3 pr-4 font-medium uppercase tracking-wide">Started</th>
            {/* md+: duration, events */}
            <th className="hidden md:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Duration</th>
            <th className="hidden md:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Events</th>
            {/* lg+: tokens, tools */}
            <th className="hidden lg:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Tokens</th>
            {!hideTools && <th className="hidden lg:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Tools</th>}
            {/* always */}
            <th className="pb-3 font-medium uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.session_id}
              onClick={() => router.push(`/conversations?session=${session.session_id}`)}
              className="group border-b border-border/30 hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              {/* sm+: session id */}
              <td className="hidden sm:table-cell py-3 pr-4">
                <div className="flex items-center font-mono text-xs text-muted-foreground">
                  {truncateId(session.session_id, 12)}
                  <CopyButton text={session.session_id} />
                </div>
              </td>

              {/* always: project */}
              <td className="py-3 pr-4 max-w-[120px]">
                <span className="font-medium text-sm truncate block">{session.project_name || '—'}</span>
              </td>

              {/* always: started */}
              <td className="py-3 pr-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground text-xs cursor-default whitespace-nowrap">
                      {formatRelativeTime(session.started_at)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{formatAbsoluteTime(session.started_at)}</TooltipContent>
                </Tooltip>
              </td>

              {/* md+: duration */}
              <td className="hidden md:table-cell py-3 pr-4 text-muted-foreground text-xs font-mono whitespace-nowrap">
                {formatDuration(session.duration_seconds)}
              </td>

              {/* md+: events */}
              <td className="hidden md:table-cell py-3 pr-4 text-xs font-mono-num">
                {session.event_count}
              </td>

              {/* lg+: tokens */}
              <td className="hidden lg:table-cell py-3 pr-4 text-xs font-mono text-muted-foreground">
                {session.total_tokens > 0 ? formatTokens(session.total_tokens) : '—'}
              </td>

              {/* lg+: tools */}
              {!hideTools && <td className="hidden lg:table-cell py-3 pr-4">
                <div className="flex flex-wrap gap-1">
                  {session.tools_used?.slice(0, 3).map((tool) => {
                    const c = getToolColor(tool);
                    return (
                      <span
                        key={tool}
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: `${c}20`, color: c, border: `1px solid ${c}40` }}
                      >
                        {tool}
                      </span>
                    );
                  })}
                  {session.tools_used?.length > 3 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      +{session.tools_used.length - 3}
                    </Badge>
                  )}
                </div>
              </td>}

              {/* always: status + hover actions */}
              <td className="py-3 relative">
                <div className="group-hover:hidden">
                  {session.error_count > 0 ? (
                    <span className="flex items-center gap-1 text-destructive text-xs font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {session.error_count}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      OK
                    </span>
                  )}
                </div>
                <div className="hidden group-hover:flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(session.session_id);
                    }}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md bg-muted/60 border border-border/40 transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/conversations?session=${session.session_id}`);
                    }}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
