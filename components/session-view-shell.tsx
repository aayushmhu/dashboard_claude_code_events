'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Session } from '@/lib/types';
import {
  Search,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Download,
  FileText,
  MessagesSquare,
} from 'lucide-react';
import { cn, formatRelativeTime, parseDbDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionViewShellProps {
  sessions: Session[];
  selectedId?: string;
  /** Which tab is currently active */
  activeTab: 'conversation' | 'summary';
  children: React.ReactNode;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function isLive(lastSeenAt: string): boolean {
  const t = parseDbDate(lastSeenAt).getTime();
  return !isNaN(t) && t <= Date.now() && Date.now() - t < 3 * 60 * 1000;
}

// ─── Tabs row ────────────────────────────────────────────────────────────────

interface TabsRowProps {
  sessionId: string;
  activeTab: 'conversation' | 'summary';
}

function TabsRow({ sessionId, activeTab }: TabsRowProps) {
  // On small screens, the two navigation tabs stack into a select-like row.
  // On md+, they render as a segmented chip group (same pattern as ScopePicker).
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-card/20 shrink-0">
      {/* Left: nav tabs (Conversation / Summary) */}
      <div className="inline-flex h-8 rounded-lg border border-border bg-card overflow-hidden text-xs">
        <Link
          href={`/conversations/${sessionId}`}
          className={cn(
            'flex items-center gap-1.5 px-3 transition-colors whitespace-nowrap',
            activeTab === 'conversation'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          <MessagesSquare className="h-3 w-3" />
          Conversation
        </Link>
        <Link
          href={`/conversations/${sessionId}/summary`}
          className={cn(
            'flex items-center gap-1.5 px-3 border-l border-border transition-colors whitespace-nowrap',
            activeTab === 'summary'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          <FileText className="h-3 w-3" />
          Summary
        </Link>
      </div>

      {/* Right: action buttons (Ask Claude / Export) */}
      <div className="flex items-center gap-2">
        <a
          href={`/chat/${sessionId}`}
          title="Open this session in Chat to ask Claude questions about it"
          className="flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-400 hover:border-fuchsia-500/60 hover:bg-fuchsia-500/20 transition-all"
        >
          <Sparkles className="h-3 w-3" />
          <span className="hidden sm:inline">Ask Claude</span>
        </a>
        <a
          href={`/api/sessions/${sessionId}/export?view=${activeTab === 'summary' ? 'summary' : 'conversation'}`}
          download
          title="Export as self-contained HTML"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
        >
          <Download className="h-3 w-3" />
          <span className="hidden sm:inline">Export</span>
        </a>
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function SessionViewShell({
  sessions: initialSessions,
  selectedId,
  activeTab,
  children,
}: SessionViewShellProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [refreshing, setRefreshing] = useState(false);

  const filteredSessions = sessions
    .filter((s) => {
      const q = search.toLowerCase();
      return (
        s.project_name?.toLowerCase().includes(q) ||
        s.session_id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const now = Date.now();
      const ta = Math.min(parseDbDate(b.last_seen_at).getTime(), now);
      const tb = Math.min(parseDbDate(a.last_seen_at).getTime(), now);
      return ta - tb;
    });

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions?limit=100');
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
    } catch {
      // silent
    }
  }, []);

  // Auto-refresh session list every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      setRefreshing(true);
      await refreshSessions();
      setRefreshing(false);
    }, 15_000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  // Keep sessions fresh when navigating between tabs
  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 flex flex-col border-r border-border bg-card/50">
        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search sessions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-input bg-background/60 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
            />
          </div>
        </div>

        {/* Session count */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
          </span>
          {refreshing && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-20" />
              <p className="text-sm">No sessions found</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = selectedId === session.session_id;
              return (
                <button
                  key={session.session_id}
                  onClick={() => router.push(`/conversations/${session.session_id}`)}
                  className={cn(
                    'w-full text-left px-3 py-3 transition-all border-b border-border/30 group relative',
                    isActive
                      ? 'bg-primary/10 border-l-2 border-l-primary'
                      : 'hover:bg-muted/40 border-l-2 border-l-transparent'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        'mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase',
                        isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {(session.project_name || 'U').charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={cn(
                            'text-sm font-medium truncate',
                            isActive ? 'text-foreground' : 'text-foreground/80'
                          )}
                        >
                          {session.project_name || 'Unknown project'}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(session.last_seen_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {session.session_id.slice(0, 8)}…
                        </span>
                        {session.error_count > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-destructive">
                            <AlertCircle className="h-2.5 w-2.5" />
                            {session.error_count}
                          </span>
                        )}
                        {isLive(session.last_seen_at) && (
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {session.event_count} events
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
              <MessageSquare className="h-8 w-8 opacity-30" />
            </div>
            <p className="text-sm font-medium">Select a session</p>
            <p className="text-xs text-muted-foreground/60">Choose a conversation from the left panel</p>
          </div>
        ) : (
          <>
            {/* Tabs row */}
            <TabsRow sessionId={selectedId} activeTab={activeTab} />
            {/* Swappable content */}
            {children}
          </>
        )}
      </div>
    </div>
  );
}
