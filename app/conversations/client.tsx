'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Session, Event } from '@/lib/types';
import { ConversationThread } from '@/components/conversation-thread';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime, formatDuration, formatTokens, parseDbDate } from '@/lib/utils';
import { Search, MessageSquare, RefreshCw, Clock, AlertCircle, Zap, Coins, Download, ChevronUp, Sparkles } from 'lucide-react';

interface ThinkingRecord {
  id: number;
  record_index: number;
  record_subtype: string;
  timestamp: string | null;
  content_text: string | null;
}

interface ConversationsClientProps {
  sessions: Session[];
  selectedId?: string;
}

export function ConversationsClient({ sessions: initialSessions, selectedId }: ConversationsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | undefined>(selectedId);
  const [events, setEvents] = useState<Event[]>([]);
  const [thinkingByEventId, setThinkingByEventId] = useState<Map<number, string>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const eventsRef = useRef(events);
  eventsRef.current = events;

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

  const buildThinkingMap = useCallback((evts: Event[], thinkingRecords: ThinkingRecord[]): Map<number, string> => {
    const map = new Map<number, string>();
    if (thinkingRecords.length === 0 || evts.length === 0) return map;
    const stopEvents = evts.filter(e => e.event_type === 'Stop' || e.event_type === 'SubagentStop');
    for (const tr of thinkingRecords) {
      if (!tr.content_text || !tr.timestamp) continue;
      const trTime = parseDbDate(tr.timestamp).getTime();
      if (isNaN(trTime)) continue;
      let best: Event | null = null;
      let bestDiff = Infinity;
      for (const stop of stopEvents) {
        const diff = parseDbDate(stop.timestamp).getTime() - trTime;
        if (diff >= -2000 && diff < 90 * 60 * 1000 && diff < bestDiff) {
          best = stop;
          bestDiff = diff;
        }
      }
      if (best) {
        const existing = map.get(best.id);
        map.set(best.id, existing ? existing + '\n\n' + tr.content_text : tr.content_text);
      }
    }
    return map;
  }, []);

  const loadEvents = useCallback(async (sessionId: string, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [evRes, trRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/events?limit=50`),
        fetch(`/api/sessions/${sessionId}/transcript?types=thinking`).catch(() => null),
      ]);
      const data = await evRes.json();
      const evts: Event[] = data.events ?? [];
      const trData = trRes ? await trRes.json().catch(() => ({ records: [] })) : { records: [] };
      const thinkingRecords: ThinkingRecord[] = trData.records ?? [];
      setEvents(evts);
      setThinkingByEventId(buildThinkingMap(evts, thinkingRecords));
      setHasMore(data.has_more ?? false);
      return evts.length;
    } catch {
      setEvents([]);
      setThinkingByEventId(new Map());
      setHasMore(false);
      return 0;
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, [buildThinkingMap]);

  const loadOlderEvents = useCallback(async () => {
    const sessionId = activeIdRef.current;
    const current = eventsRef.current;
    if (!sessionId || current.length === 0) return;

    setLoadingMore(true);
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const oldestId = (current[0] as Event & { id: number }).id;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/events?before_id=${oldestId}&limit=50`);
      const data = await res.json();
      const older: Event[] = data.events ?? [];
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setHasMore(data.has_more ?? false);
      setEvents((cur) => [...older, ...cur]);
      // Restore scroll position after DOM updates from prepend
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
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

  // Sync activeId when selectedId prop changes (soft navigation between /conversations/[id] routes)
  useEffect(() => {
    if (selectedId !== undefined) setActiveId(selectedId);
  }, [selectedId]);

  // Load events when active session changes, then scroll to bottom
  useEffect(() => {
    if (!activeId) return;
    setEvents([]);
    setHasMore(false);
    prevEventCount.current = 0;
    loadEvents(activeId).then(() => {
      // Double rAF: first ensures React committed the new events, second ensures layout is done
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (container) container.scrollTop = container.scrollHeight;
        });
      });
    });
  }, [activeId, loadEvents]);

  // Scroll to bottom when auto-refresh appends new events and user is near the bottom
  useEffect(() => {
    if (events.length === 0 || events.length <= prevEventCount.current) return;
    if (prevEventCount.current > 0) {
      const container = scrollContainerRef.current;
      if (container) {
        const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distFromBottom < 200) container.scrollTop = container.scrollHeight;
      }
    }
    prevEventCount.current = events.length;
  }, [events]);

  // Detect scroll to top → load older events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (container.scrollTop < 80 && hasMore && !loadingMore) {
        loadOlderEvents();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loadOlderEvents]);

  // Auto-refresh every 15s — appends only newer events
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!activeIdRef.current) return;
      setRefreshing(true);
      await Promise.all([
        refreshSessions(),
        (async () => {
          try {
            const res = await fetch(`/api/sessions/${activeIdRef.current}/events?limit=50`);
            const data = await res.json();
            const fresh: Event[] = data.events ?? [];
            setEvents((prev) => {
              if (fresh.length === 0) return prev;
              const prevIds = new Set(prev.map((e) => (e as Event & { id: number }).id));
              const newer = fresh.filter((e) => !prevIds.has((e as Event & { id: number }).id));
              return newer.length > 0 ? [...prev, ...newer] : prev;
            });
          } catch { /* silent */ }
        })(),
      ]);
      setRefreshing(false);
    }, 15_000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  const activeSession = sessions.find((s) => s.session_id === activeId);

  function isLive(lastSeenAt: string): boolean {
    const d = parseDbDate(lastSeenAt);
    const t = d.getTime();
    return !isNaN(t) && t <= Date.now() && Date.now() - t < 3 * 60 * 1000;
  }

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
                  onClick={() => router.push(`/conversations/${session.session_id}`)}
                  className={`w-full text-left px-3 py-3 transition-all border-b border-border/30 group relative ${
                    isActive
                      ? 'bg-primary/10 border-l-2 border-l-primary'
                      : 'hover:bg-muted/40 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
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
                      {activeSession.total_tokens > 0 && (
                        <>
                          <span>·</span>
                          <Coins className="h-3 w-3" />
                          <span>{formatTokens(activeSession.total_tokens)}</span>
                        </>
                      )}
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
                <div className="flex items-center gap-2">
                  {refreshing && <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />}
                  <a
                    href={`/api/sessions/${activeId}/export`}
                    download
                    title="Export as self-contained HTML"
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </a>
                  <a
                    href={`/chat/${activeId}`}
                    title="Open this session in Chat to ask Claude questions about it"
                    className="flex items-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-xs font-medium text-fuchsia-400 hover:border-fuchsia-500/60 hover:bg-fuchsia-500/20 transition-all"
                  >
                    <Sparkles className="h-3 w-3" />
                    Ask Claude
                  </a>
                </div>
              </div>
            )}

            {/* Scrollable thread */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
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
                  {/* Load-older indicator */}
                  {hasMore && (
                    <div className="flex justify-center py-3">
                      {loadingMore ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Loading older events…
                        </div>
                      ) : (
                        <button
                          onClick={loadOlderEvents}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronUp className="h-3 w-3" />
                          Load older events
                        </button>
                      )}
                    </div>
                  )}
                  <ConversationThread events={events} thinkingByEventId={thinkingByEventId} />
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
