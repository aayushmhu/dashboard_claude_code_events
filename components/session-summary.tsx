'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  MessageSquare,
  Coins,
  DollarSign,
  AlertCircle,
  Wrench,
  User,
  Bot,
  HelpCircle,
  TrendingUp,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { cn, formatDuration, formatTokens, formatCost, parseDbDate } from '@/lib/utils';
import { getAgentColor } from '@/lib/colors';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  SessionSummaryResponse,
  SessionSummaryMoment,
  SessionSummaryParticipants,
  SessionSummaryHeader,
  SessionSummaryModelBreakdown,
} from '@/app/api/sessions/[id]/summary/route';

// ─── User name resolution (strict rule: env var or "User") ───────────────────

const DISPLAY_USER_NAME =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_USER_NAME ?? 'User')
    : 'User';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSummaryProps {
  sessionId: string;
  /**
   * 'panel' (default): rendered inline in the conversation view. Key moment clicks
   *   call onScrollToEvent to scroll within the same page.
   * 'page': rendered as a full dedicated page. Key moment rows are accordion-expanded
   *   inline; no navigation on click.
   */
  mode?: 'panel' | 'page';
  /** panel mode only: called when user clicks an event anchor */
  onScrollToEvent?: (eventId: number) => void;
}

// ─── Moment icon + label map ─────────────────────────────────────────────────

function momentIcon(type: SessionSummaryMoment['moment_type']) {
  switch (type) {
    case 'user_prompt':       return <User className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />;
    case 'subagent_dispatch': return <Bot className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />;
    case 'ask_user':          return <HelpCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />;
    case 'high_cost':         return <TrendingUp className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />;
    case 'error':             return <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />;
    case 'final_outcome':     return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />;
  }
}

function momentLabel(m: SessionSummaryMoment): string {
  switch (m.moment_type) {
    case 'user_prompt':       return 'User prompt';
    case 'subagent_dispatch': return m.agent_type ? `Spawned ${m.agent_type}` : 'Spawned subagent';
    case 'ask_user':          return 'Question';
    case 'high_cost':         return `High-cost turn${m.cost != null ? ` (${formatCost(m.cost)})` : ''}`;
    case 'error':             return m.tool_name ? `Error in ${m.tool_name}` : 'Error';
    case 'final_outcome':     return 'Done';
  }
}

/** Actor label for a moment row. Returns "{name} ({role})" format. */
function actorLabel(m: SessionSummaryMoment): string | null {
  switch (m.moment_type) {
    case 'user_prompt':
      return `${DISPLAY_USER_NAME} (User)`;
    case 'ask_user':
    case 'subagent_dispatch': {
      const name = m.agent_type && m.agent_type !== 'subagent' ? m.agent_type : 'Claude';
      return `${name} (Agent)`;
    }
    case 'high_cost':
    case 'final_outcome':
    case 'error':
      return 'Claude (Agent)';
    default:
      return null;
  }
}

function momentBody(m: SessionSummaryMoment): string | null {
  if (m.moment_type === 'user_prompt' && m.content_snippet) {
    const snippet = m.content_snippet.replace(/\n+/g, ' ').trim();
    return snippet.length > 120 ? snippet.slice(0, 120) + '…' : snippet;
  }
  if (m.moment_type === 'error' && m.error_message) {
    const msg = m.error_message.trim();
    return msg.length > 100 ? msg.slice(0, 100) + '…' : msg;
  }
  if (m.moment_type === 'ask_user' && m.content_snippet) {
    try {
      const parsed = JSON.parse(m.content_snippet);
      const first = parsed?.questions?.[0]?.header ?? parsed?.question ?? null;
      if (first) return String(first).slice(0, 100);
    } catch {
      // not valid JSON snippet — show raw
    }
    return m.content_snippet.slice(0, 100);
  }
  return null;
}

// ─── AskUserQuestion expanded content ────────────────────────────────────────

interface AskUserExpandedProps {
  contentSnippet: string | null;
  answer: string | null;
}

function AskUserExpanded({ contentSnippet, answer }: AskUserExpandedProps) {
  if (!contentSnippet) return null;

  let parsed: {
    questions?: Array<{
      header?: string;
      question?: string;
      options?: Array<{ label?: string; description?: string }>;
      multiSelect?: boolean;
    }>;
  } | null = null;

  try {
    parsed = JSON.parse(contentSnippet);
  } catch {
    // raw text fallback
  }

  if (!parsed?.questions?.length) {
    // Fallback: raw snippet
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">{contentSnippet.slice(0, 300)}</p>
        {answer && (
          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
            <span className="font-medium text-blue-400">{DISPLAY_USER_NAME} answered: </span>
            {answer.slice(0, 200)}
          </div>
        )}
      </div>
    );
  }

  // Normalize the answer text for matching
  const normalizedAnswer = answer?.trim().toLowerCase() ?? '';

  return (
    <div className="mt-2 space-y-4">
      {parsed.questions.map((q, qi) => {
        const questionText = q.question ?? q.header ?? '';
        const options = q.options ?? [];

        // Try to match picked option(s) by label
        const pickedLabels = options
          .filter((opt) => {
            const lbl = (opt.label ?? '').trim().toLowerCase();
            return lbl && normalizedAnswer.includes(lbl);
          })
          .map((opt) => opt.label ?? '');

        return (
          <div key={qi} className="space-y-1.5">
            {q.header && (
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                {q.header}
              </p>
            )}
            {questionText && (
              <p className="text-xs font-medium text-foreground/80">{questionText}</p>
            )}
            {options.length > 0 && (
              <div className="space-y-1">
                {options.map((opt, oi) => {
                  const isPicked = pickedLabels.includes(opt.label ?? '');
                  return (
                    <div
                      key={oi}
                      className={cn(
                        'rounded-md px-3 py-2 text-xs transition-colors',
                        isPicked
                          ? 'bg-primary/15 border border-primary/30 text-foreground'
                          : 'bg-muted/30 border border-border/40 text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'font-medium',
                          isPicked ? 'text-primary' : 'text-foreground/70'
                        )}
                      >
                        {opt.label}
                      </span>
                      {isPicked && (
                        <span className="ml-2 text-[10px] font-semibold text-primary/80 bg-primary/10 rounded px-1 py-0.5">
                          picked
                        </span>
                      )}
                      {opt.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                          {opt.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* If answer doesn't match any option, show raw answer as "Other" */}
            {answer && pickedLabels.length === 0 && qi === 0 && (
              <div className="rounded-md bg-muted/40 border border-border/50 px-3 py-2 text-xs">
                <span className="font-medium text-foreground/70">{DISPLAY_USER_NAME} replied: </span>
                <span className="text-muted-foreground">{answer.slice(0, 300)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniStat({
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
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={cn('text-sm font-mono font-semibold tabular-nums leading-none', valueClass)}>
        {value}
      </span>
    </div>
  );
}

function AgentPill({ agentType, count }: { agentType: string; count: number }) {
  const colors = getAgentColor(agentType);
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      <Bot className="h-3 w-3" />
      {agentType}
      {count > 1 && (
        <span className="opacity-70 font-normal">&times;{count}</span>
      )}
    </span>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SessionSummarySkeleton({ isPage }: { isPage: boolean }) {
  if (isPage) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:flex md:flex-wrap md:gap-x-10 md:gap-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-px w-full" />
        <div className="flex flex-wrap gap-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-24 rounded-full" />)}
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-4 md:flex md:flex-wrap md:gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-px w-full" />
        <div className="flex flex-wrap gap-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-24 rounded-full" />)}
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>
    </div>
  );
}

// ─── Key moment row ───────────────────────────────────────────────────────────

interface MomentRowProps {
  m: SessionSummaryMoment;
  isLast: boolean;
  isPage: boolean;
  sessionId: string;
  onScrollToEvent?: (eventId: number) => void;
}

function MomentRow({ m, isLast, isPage, sessionId, onScrollToEvent }: MomentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const body = momentBody(m);
  const isError = m.moment_type === 'error';
  const actor = actorLabel(m);

  // In page mode: accordion expand. No navigation.
  // In panel mode: errors scroll via callback; all others are static.
  const canScroll = !isPage && isError && m.event_id && onScrollToEvent;
  // In panel mode with non-error moments that have an event_id: link to conversation
  const canNavigatePanel = !isPage && !isError && m.event_id;

  const timestamp = (() => {
    try {
      const d = parseDbDate(m.timestamp);
      return isNaN(d.getTime())
        ? m.timestamp
        : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return m.timestamp;
    }
  })();

  const headerContent = (
    <>
      {/* Actor label */}
      {actor && (
        <p className="text-[10px] text-muted-foreground/60 font-medium mb-0.5">{actor}</p>
      )}
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span
          className={cn(
            'text-[11px] font-medium',
            m.moment_type === 'error' && 'text-red-400',
            m.moment_type === 'high_cost' && 'text-orange-400',
            m.moment_type === 'final_outcome' && 'text-emerald-400',
            m.moment_type === 'subagent_dispatch' && 'text-purple-400',
            m.moment_type === 'user_prompt' && 'text-blue-400',
            m.moment_type === 'ask_user' && 'text-amber-400',
          )}
        >
          {momentLabel(m)}
        </span>
        <time className="text-[10px] text-muted-foreground/60 font-mono flex-shrink-0">
          {timestamp}
        </time>
      </div>
      {body && (
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 break-words">
          {body}
        </p>
      )}
    </>
  );

  // Page mode: accordion row
  if (isPage) {
    const isExpandable =
      m.moment_type === 'ask_user' ||
      m.moment_type === 'user_prompt' ||
      m.moment_type === 'error' ||
      m.moment_type === 'subagent_dispatch';

    return (
      <li className="relative pl-6">
        {!isLast && (
          <span className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
        )}
        <span className="absolute left-0 top-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-card border border-border">
          {momentIcon(m.moment_type)}
        </span>
        <div className="pb-3 min-w-0">
          {isExpandable ? (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="w-full text-left hover:opacity-80 transition-opacity focus:outline-none"
              aria-expanded={expanded}
            >
              <div className="flex items-start gap-1">
                <div className="flex-1 min-w-0">{headerContent}</div>
                <span className="flex-shrink-0 mt-1 text-muted-foreground/40">
                  {expanded
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />
                  }
                </span>
              </div>
            </button>
          ) : (
            headerContent
          )}

          {/* Expanded content */}
          {expanded && (
            <div className="mt-2 pl-0">
              {m.moment_type === 'ask_user' && (
                <AskUserExpanded
                  contentSnippet={m.content_snippet}
                  answer={m.ask_user_answer ?? null}
                />
              )}
              {m.moment_type === 'user_prompt' && m.content_snippet && (
                <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-md px-3 py-2 border border-border/40">
                  {m.content_snippet}
                </p>
              )}
              {m.moment_type === 'error' && m.error_message && (
                <p className="text-xs text-red-400/80 leading-relaxed bg-red-500/5 rounded-md px-3 py-2 border border-red-500/20">
                  {m.error_message}
                </p>
              )}
              {m.moment_type === 'subagent_dispatch' && (
                <p className="text-xs text-muted-foreground">
                  Agent type: <span className="font-medium text-purple-400">{m.agent_type ?? m.agent_value ?? 'subagent'}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </li>
    );
  }

  // Panel mode
  return (
    <li className="relative pl-6">
      {!isLast && (
        <span className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
      )}
      <span className="absolute left-0 top-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-card border border-border">
        {momentIcon(m.moment_type)}
      </span>

      {canNavigatePanel ? (
        <Link
          href={`/conversations/${sessionId}#event-${m.event_id}`}
          className="block pb-3 min-w-0 hover:opacity-80 transition-opacity"
        >
          {headerContent}
        </Link>
      ) : (
        <div
          className={cn(
            'pb-3 min-w-0',
            canScroll && 'cursor-pointer hover:opacity-80 transition-opacity'
          )}
          onClick={canScroll ? () => onScrollToEvent!(m.event_id) : undefined}
        >
          {headerContent}
        </div>
      )}
    </li>
  );
}

// ─── Shared body content ──────────────────────────────────────────────────────

function SummaryBody({
  header,
  participants,
  key_moments,
  model_breakdown,
  startedStr,
  sessionId,
  isPage,
  onScrollToEvent,
}: {
  header: SessionSummaryHeader;
  participants: SessionSummaryParticipants;
  key_moments: SessionSummaryMoment[];
  model_breakdown: SessionSummaryModelBreakdown[];
  startedStr: string;
  sessionId: string;
  isPage: boolean;
  onScrollToEvent?: (eventId: number) => void;
}) {
  return (
    <>
      {/* ── Header stats ── */}
      <div className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:flex md:flex-wrap md:gap-x-8 md:gap-y-2',
        isPage ? '' : 'pt-4'
      )}>
        <MiniStat label="Started" value={startedStr} icon={Clock} />
        <MiniStat label="Duration" value={formatDuration(header.duration_seconds)} icon={Clock} />
        <MiniStat label="Turns" value={String(header.turn_count)} icon={MessageSquare} />
        <MiniStat label="Tokens" value={formatTokens(header.total_tokens)} icon={Coins} />
        <MiniStat
          label="Cost"
          value={formatCost(header.total_cost)}
          icon={DollarSign}
          valueClass="text-amber-400"
        />
        {header.error_count > 0 && (
          <MiniStat
            label="Errors"
            value={String(header.error_count)}
            icon={AlertCircle}
            valueClass="text-red-400"
          />
        )}
        {header.top_3_tools.length > 0 && (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              Top tools
            </span>
            <span className="text-sm font-mono font-semibold leading-none truncate">
              {header.top_3_tools.join(', ')}
            </span>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* ── Participants ── */}
      {(participants.has_main_agent || participants.subagents.length > 0) && (
        <>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
              Participants
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              {participants.has_main_agent && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <User className="h-3 w-3" />
                  Main agent
                </span>
              )}
              {participants.subagents.map((s, i) => (
                <AgentPill key={i} agentType={s.agent_type} count={s.dispatch_count} />
              ))}
            </div>
          </div>
          <div className="h-px bg-border" />
        </>
      )}

      {/* ── Key moments timeline ── */}
      {key_moments.length > 0 && (
        <>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-3">
              Key Moments
            </p>
            <ol className="relative space-y-0">
              {key_moments.map((m, i) => (
                <MomentRow
                  key={`${m.event_id}-${m.moment_type}`}
                  m={m}
                  isLast={i === key_moments.length - 1}
                  isPage={isPage}
                  sessionId={sessionId}
                  onScrollToEvent={onScrollToEvent}
                />
              ))}
            </ol>
          </div>
          <div className="h-px bg-border" />
        </>
      )}

      {/* ── Model breakdown (only when >1 model family) ── */}
      {model_breakdown.length > 1 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
            Cost by Model
          </p>
          <div className="flex flex-wrap gap-3">
            {model_breakdown.map((mb) => (
              <div key={mb.model_family} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground capitalize">
                  {mb.model_family}
                </span>
                <span className="text-xs font-mono font-semibold text-amber-400 tabular-nums">
                  {formatCost(mb.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionSummary({ sessionId, mode = 'panel', onScrollToEvent }: SessionSummaryProps) {
  const isPage = mode === 'page';
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<SessionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/sessions/${sessionId}/summary`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: SessionSummaryResponse) => setData(d))
      .catch((e: Error) => setError(e.message ?? 'Unknown error'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <SessionSummarySkeleton isPage={isPage} />;

  if (error) {
    if (isPage) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <AlertCircle className="h-8 w-8 text-red-400/60" />
          <p className="text-sm">Couldn&apos;t load summary</p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
        Couldn&apos;t load summary
      </div>
    );
  }

  if (!data) return null;

  const { header, participants, key_moments, model_breakdown } = data;

  const hasNoActivity =
    header.turn_count === 0 &&
    header.total_tokens === 0 &&
    key_moments.length === 0;

  const startedDate = parseDbDate(header.started_at);
  const startedStr = isNaN(startedDate.getTime())
    ? header.started_at
    : startedDate.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  // ── Page mode: no card shell, no collapse toggle ──
  if (isPage) {
    return (
      <div className="space-y-6">
        {hasNoActivity ? (
          <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-sm">This session has no recorded turns.</p>
          </div>
        ) : (
          <SummaryBody
            header={header}
            participants={participants}
            key_moments={key_moments}
            model_breakdown={model_breakdown}
            startedStr={startedStr}
            sessionId={sessionId}
            isPage={true}
            onScrollToEvent={onScrollToEvent}
          />
        )}
      </div>
    );
  }

  // ── Panel mode: collapsible card ──
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-foreground">Session Summary</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 space-y-4">
          {hasNoActivity ? (
            <div className="pt-4 flex flex-col items-center gap-2 py-6 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">This session has no recorded turns.</p>
            </div>
          ) : (
            <SummaryBody
              header={header}
              participants={participants}
              key_moments={key_moments}
              model_breakdown={model_breakdown}
              startedStr={startedStr}
              sessionId={sessionId}
              isPage={false}
              onScrollToEvent={onScrollToEvent}
            />
          )}
        </div>
      )}
    </div>
  );
}
