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
  ArrowRight,
} from 'lucide-react';
import { cn, formatDuration, formatTokens, formatCost, parseDbDate } from '@/lib/utils';
import { getAgentColor, TOOL_COLORS } from '@/lib/colors';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  SessionSummaryResponse,
  SessionSummaryParticipants,
  SessionSummaryHeader,
  SessionSummaryModelBreakdown,
  SessionSummaryPrompt,
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
   * 'panel' (default): rendered inline in the conversation view. Per-prompt jump
   *   icons call onScrollToEvent to scroll within the same page.
   * 'page': rendered as a full dedicated page. Per-prompt jump icons link to
   *   the conversation thread.
   */
  mode?: 'panel' | 'page';
  /** panel mode only: called when user clicks a per-prompt jump icon */
  onScrollToEvent?: (eventId: number) => void;
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

// ─── Shared body content ──────────────────────────────────────────────────────

function SummaryBody({
  header,
  participants,
  model_breakdown,
  prompts,
  startedStr,
  sessionId,
  isPage,
  onScrollToEvent,
}: {
  header: SessionSummaryHeader;
  participants: SessionSummaryParticipants;
  model_breakdown: SessionSummaryModelBreakdown[];
  prompts: SessionSummaryPrompt[];
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

      {/* ── Prompts ── */}
      <PromptsSection
        prompts={prompts}
        sessionId={sessionId}
        mode={isPage ? 'page' : 'panel'}
        onScrollToEvent={onScrollToEvent}
      />

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

// ─── Prompts section (Phase 1 + 1.1) ─────────────────────────────────────────

function ToolChip({ name }: { name: string }) {
  const color = TOOL_COLORS[name as keyof typeof TOOL_COLORS] ?? '#94a3b8';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ background: `${color}15`, color, border: `1px solid ${color}55` }}
    >
      {name}
    </span>
  );
}

function PromptRow({
  prompt,
  sessionId,
  mode,
  onScrollToEvent,
}: {
  prompt: SessionSummaryPrompt;
  sessionId: string;
  mode: 'panel' | 'page';
  onScrollToEvent?: (id: number) => void;
}) {
  const time = (() => {
    try {
      const d = parseDbDate(prompt.timestamp);
      return d.toTimeString().slice(0, 5);
    } catch { return ''; }
  })();

  const extraTools = prompt.tool_type_count - prompt.top_tools.length;

  const jumpInner = (
    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
  );
  const jump = mode === 'panel'
    ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onScrollToEvent?.(prompt.prompt_id); }}
          className="flex-shrink-0"
          aria-label="Jump to this prompt in conversation"
        >
          {jumpInner}
        </button>
      )
    : (
        <Link
          href={`/conversations/${sessionId}?focus=${prompt.prompt_id}`}
          className="flex-shrink-0"
          aria-label="Jump to this prompt in conversation"
        >
          {jumpInner}
        </Link>
      );

  return (
    <div
      className={cn(
        'group px-4 py-3 border-b border-border/40 last:border-0 transition-colors hover:bg-muted/20',
        prompt.has_error && 'border-l-2 border-l-red-500/70'
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums w-12 flex-shrink-0 pt-0.5">
          {time}
        </span>
        <p
          className="text-sm text-foreground/90 truncate min-w-0 flex-1"
          title={prompt.prompt_text}
        >
          {prompt.prompt_text || <span className="italic text-muted-foreground">(empty prompt)</span>}
        </p>
        {jump}
      </div>
      {prompt.response_excerpt && (
        <div className="flex items-start gap-1.5 pl-[60px] min-w-0 mt-1">
          <span className="text-muted-foreground/50 text-xs flex-shrink-0 select-none" aria-hidden>↳</span>
          <p
            className="text-xs text-muted-foreground/80 italic leading-snug break-words min-w-0"
            title={prompt.response_excerpt}
          >
            {prompt.response_excerpt}
          </p>
        </div>
      )}
      <div className="flex items-center flex-wrap gap-2 mt-1.5 pl-[60px] text-[11px] text-muted-foreground">
        <span>{prompt.turn_count} {prompt.turn_count === 1 ? 'turn' : 'turns'}</span>
        {prompt.file_edit_count > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{prompt.file_edit_count} {prompt.file_edit_count === 1 ? 'file' : 'files'}</span>
          </>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span className="font-mono text-amber-400/80">{formatCost(prompt.moment_cost)}</span>
        {prompt.top_tools.length > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <div className="flex items-center gap-1 flex-wrap">
              {prompt.top_tools.map((t) => <ToolChip key={t} name={t} />)}
              {extraTools > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted/50 text-muted-foreground border border-border/60">
                  +{extraTools}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PromptsSection({
  prompts,
  sessionId,
  mode,
  onScrollToEvent,
}: {
  prompts: SessionSummaryPrompt[];
  sessionId: string;
  mode: 'panel' | 'page';
  onScrollToEvent?: (id: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (prompts.length === 0) return null;
  const visible = showAll ? prompts : prompts.slice(0, 20);
  const hidden = prompts.length - visible.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Prompts ({prompts.length})
        </h3>
        {mode === 'panel' && (
          <Link
            href={`/conversations/${sessionId}`}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            See all in thread →
          </Link>
        )}
      </div>
      <div>
        {visible.map((p) => (
          <PromptRow
            key={p.prompt_id}
            prompt={p}
            sessionId={sessionId}
            mode={mode}
            onScrollToEvent={onScrollToEvent}
          />
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground border-t border-dashed border-border hover:bg-muted/30 transition-colors"
        >
          Show all {prompts.length} prompts
        </button>
      )}
    </div>
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

  const { header, participants, model_breakdown, prompts } = data;

  const hasNoActivity =
    header.turn_count === 0 &&
    header.total_tokens === 0 &&
    prompts.length === 0;

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
            model_breakdown={model_breakdown}
            prompts={prompts}
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
                model_breakdown={model_breakdown}
              prompts={prompts}
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
