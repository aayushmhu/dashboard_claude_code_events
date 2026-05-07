'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Session, Event } from '@/lib/types';
import { ConversationThread } from '@/components/conversation-thread';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime, getProjectName, formatDuration } from '@/lib/utils';
import { Search, MessageSquare, RefreshCw, Clock, AlertCircle, Zap } from 'lucide-react';

interface ConversationsClientProps {
  sessions: Session[];
  selectedId?: string;
}

export function ConversationsClient({ sessions: initialSessions, selectedId }: ConversationsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | undefined>(selectedId);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);

  const filteredSessions = sessions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.project_name?.toLowerCase().includes(q) ||
      s.session_id.toLowerCase().includes(q)
    );
  });

  const loadEvents = useCallback(async (sessionId: string, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/events`);
      const data = await res.json();
      const evts = Array.isArray(data) ? data : [];
      setEvents(evts);
      return evts.length;
    } catch {
      setEvents([]);
      return 0;
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions?limit=100');
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
    } catch {
      // silent
    }
  }, []);

  // Initial load + URL sync
  useEffect(() => {
    if (activeId) {
      loadEvents(activeId).then((count) => {
        prevEventCount.current = count;
      });
      router.replace(`/conversations?session=${activeId}`, { scroll: false });
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when events first load or new events arrive
  useEffect(() => {
    if (events.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: events.length !== prevEventCount.current ? 'smooth' : 'instant' });
      prevEventCount.current = events.length;
    }
  }, [events]);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      setRefreshing(true);
      await Promise.all([
        refreshSessions(),
        activeId ? loadEvents(activeId, true) : Promise.resolve(),
      ]);
      setRefreshing(false);
    }, 15_000);
    return () => clearInterval(interval);
  }, [activeId, loadEvents, refreshSessions]);

  const activeSession = sessions.find((s) => s.session_id === activeId);

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
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
              const isActive = activeId === session.session_id;
              return (
                <button
                  key={session.session_id}
                  onClick={() => setActiveId(session.session_id)}
                  className={`w-full text-left px-3 py-3 transition-all border-b border-border/30 group relative ${
                    isActive
                      ? 'bg-primary/10 border-l-2 border-l-primary'
                      : 'hover:bg-muted/40 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Project icon */}
                    <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase ${
                      isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {(session.project_name || 'U').charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-foreground/80'}`}>
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

      {/* Thread area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
              <MessageSquare className="h-8 w-8 opacity-30" />
            </div>
            <p className="text-sm font-medium">Select a session</p>
            <p className="text-xs text-muted-foreground/60">Choose a conversation from the left panel</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            {activeSession && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card/30 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold uppercase text-primary">
                    {activeSession.project_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{activeSession.project_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{activeSession.session_id.slice(0, 12)}…</span>
                      <span>·</span>
                      <Clock className="h-3 w-3" />
                      <span>{formatDuration(activeSession.duration_seconds)}</span>
                      <span>·</span>
                      <Zap className="h-3 w-3" />
                      <span>{events.length} events</span>
                      {activeSession.error_count > 0 && (
                        <>
                          <span>·</span>
                          <AlertCircle className="h-3 w-3 text-destructive" />
                          <span className="text-destructive">{activeSession.error_count} errors</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {refreshing && <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />}
              </div>
            )}

            {/* Scrollable thread */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 space-y-5">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'}`}>
                      <Skeleton className={`h-14 ${i % 3 === 0 ? 'w-2/3' : 'w-3/4'} rounded-2xl`} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <ConversationThread events={events} />
                  <div ref={threadEndRef} className="h-6" />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
