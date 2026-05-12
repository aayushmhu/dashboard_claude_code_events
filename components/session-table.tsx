'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Session } from '@/lib/types';
import { formatRelativeTime, formatAbsoluteTime, formatDuration, truncateId, formatTokens } from '@/lib/utils';
import { getToolColor } from '@/lib/colors';
import { Copy, AlertCircle, Check, Terminal, Monitor, Code2, Brain, ImageIcon } from 'lucide-react';
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
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text);
        } else {
          const el = document.createElement('textarea');
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
        }
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

function EntrypointIcon({ entrypoint }: { entrypoint?: string | null }) {
  if (!entrypoint) return null;
  const Icon = entrypoint === 'vscode' ? Monitor : entrypoint === 'sdk' || entrypoint === 'sdk-cli' ? Code2 : Terminal;
  const label = entrypoint === 'vscode' ? 'VS Code' : entrypoint === 'sdk' || entrypoint === 'sdk-cli' ? 'SDK' : 'CLI';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground/40"><Icon className="h-3 w-3" /></span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
    <>
      {/* Mobile card layout — shown below md */}
      <div className="md:hidden space-y-2">
        {sessions.map((session) => (
          <div
            key={session.session_id}
            onClick={() => router.push(`/conversations?session=${session.session_id}`)}
            className="rounded-xl border border-border/50 bg-card/40 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
          >
            {/* Row 1: project + status */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{session.project_name || '—'}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <EntrypointIcon entrypoint={session.entrypoint} />
                  {session.thinking_count > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-violet-400/50"><Brain className="h-3 w-3" /></span>
                      </TooltipTrigger>
                      <TooltipContent>{session.thinking_count} thinking blocks</TooltipContent>
                    </Tooltip>
                  )}
                  {session.image_count > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-blue-400/50"><ImageIcon className="h-3 w-3" /></span>
                      </TooltipTrigger>
                      <TooltipContent>{session.image_count} images</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              {session.error_count > 0 ? (
                <span className="flex items-center gap-1 text-destructive text-xs font-medium shrink-0">
                  <AlertCircle className="h-3.5 w-3.5" />{session.error_count}
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] font-medium text-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                  OK
                </span>
              )}
            </div>

            {/* Row 2: meta */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>{formatRelativeTime(session.started_at)}</span>
              {session.duration_seconds > 0 && <span>{formatDuration(session.duration_seconds)}</span>}
              <span>{session.event_count} events</span>
              {session.total_tokens > 0 && <span>{formatTokens(session.total_tokens)}</span>}
            </div>

            {/* Session ID */}
            <p className="font-mono text-[10px] text-muted-foreground/40 mt-1.5">{truncateId(session.session_id, 16)}</p>
          </div>
        ))}
      </div>

      {/* Table — shown from md+ */}
      <div className="hidden md:block overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground/60">
              <th className="hidden sm:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Session</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-wide">Project</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-wide">Started</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-wide">Duration</th>
              <th className="pb-3 pr-4 font-medium uppercase tracking-wide">Events</th>
              <th className="hidden lg:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Tokens</th>
              {!hideTools && <th className="hidden lg:table-cell pb-3 pr-4 font-medium uppercase tracking-wide">Tools</th>}
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
                <td className="hidden sm:table-cell py-3 pr-4">
                  <div className="flex items-center font-mono text-xs text-muted-foreground">
                    {truncateId(session.session_id, 12)}
                    <CopyButton text={session.session_id} />
                  </div>
                </td>

                <td className="py-3 pr-4 max-w-[140px]">
                  <span className="font-medium text-sm truncate block">{session.project_name || '—'}</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <EntrypointIcon entrypoint={session.entrypoint} />
                    {session.thinking_count > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-violet-400/40"><Brain className="h-3 w-3" /></span>
                        </TooltipTrigger>
                        <TooltipContent>{session.thinking_count} thinking block{session.thinking_count !== 1 ? 's' : ''}</TooltipContent>
                      </Tooltip>
                    )}
                    {session.image_count > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-blue-400/40"><ImageIcon className="h-3 w-3" /></span>
                        </TooltipTrigger>
                        <TooltipContent>{session.image_count} image{session.image_count !== 1 ? 's' : ''}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>

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

                <td className="py-3 pr-4 text-muted-foreground text-xs font-mono whitespace-nowrap">
                  {formatDuration(session.duration_seconds)}
                </td>

                <td className="py-3 pr-4 text-xs font-mono-num">
                  {session.event_count}
                </td>

                <td className="hidden lg:table-cell py-3 pr-4 text-xs font-mono text-muted-foreground">
                  {session.total_tokens > 0 ? formatTokens(session.total_tokens) : '—'}
                </td>

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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
