'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, Event } from '@/lib/types';
import { ConversationThread } from '@/components/conversation-thread';
import { SessionViewShell } from '@/components/session-view-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { parseDbDate, formatDuration, formatTokens } from '@/lib/utils';
import {
  RefreshCw,
  Clock,
  AlertCircle,
  Zap,
  Coins,
  ChevronUp,
} from 'lucide-react';

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

export function ConversationsClient({ sessions, selectedId }: ConversationsClientProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [thinkingByEventId, setThinkingByEventId] = useState<Map<number, string>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);
  const activeIdRef = useRef(selectedId);
  activeIdRef.current = selectedId;
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const buildThinkingMap = useCallback(
    (evts: Event[], thinkingRecords: ThinkingRecord[]): Map<number, string> => {
      const map = new Map<number, string>();
      if (thinkingRecords.length === 0 || evts.length === 0) return map;
      const stopEvents = evts.filter(
        (e) => e.event_type === 'Stop' || e.event_type === 'SubagentStop'
      );
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
    },
    []
  );

  const loadEvents = useCallback(
    async (sessionId: string, isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      try {
        const [evRes, trRes] = await Promise.all([
          fetch(`/api/sessions/${sessionId}/events?limit=50`),
          fetch(`/api/sessions/${sessionId}/transcript?types=thinking`).catch(() => null),
        ]);
        const data = await evRes.json();
        const evts: Event[] = data.events ?? [];
        const trData = trRes
          ? await trRes.json().catch(() => ({ records: [] }))
          : { records: [] };
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
    },
    [buildThinkingMap]
  );

  const loadOlderEvents = useCallback(async () => {
    const sessionId = activeIdRef.current;
    const current = eventsRef.current;
    if (!sessionId || current.length === 0) return;

    setLoadingMore(true);
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const oldestId = (current[0] as Event & { id: number }).id;

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/events?before_id=${oldestId}&limit=50`
      );
      const data = await res.json();
      const older: Event[] = data.events ?? [];
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setHasMore(data.has_more ?? false);
      setEvents((cur) => [...older, ...cur]);
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

  // Load events when session changes, scroll to bottom
  useEffect(() => {
    if (!selectedId) return;
    setEvents([]);
    setHasMore(false);
    prevEventCount.current = 0;
    loadEvents(selectedId).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (container) container.scrollTop = container.scrollHeight;
        });
      });
    });
  }, [selectedId, loadEvents]);

  // Scroll to bottom when auto-refresh appends new events
  useEffect(() => {
    if (events.length === 0 || events.length <= prevEventCount.current) return;
    if (prevEventCount.current > 0) {
      const container = scrollContainerRef.current;
      if (container) {
        const distFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
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

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!activeIdRef.current) return;
      setRefreshing(true);
      try {
        const res = await fetch(
          `/api/sessions/${activeIdRef.current}/events?limit=50`
        );
        const data = await res.json();
        const fresh: Event[] = data.events ?? [];
        setEvents((prev) => {
          if (fresh.length === 0) return prev;
          const prevIds = new Set(prev.map((e) => (e as Event & { id: number }).id));
          const newer = fresh.filter((e) => !prevIds.has((e as Event & { id: number }).id));
          return newer.length > 0 ? [...prev, ...newer] : prev;
        });
      } catch {
        // silent
      } finally {
        setRefreshing(false);
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const activeSession = sessions.find((s) => s.session_id === selectedId);

  return (
    <SessionViewShell
      sessions={sessions}
      selectedId={selectedId}
      activeTab="conversation"
    >
      <>
        {/* Per-session header strip */}
        {activeSession && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 backdrop-blur-sm shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold uppercase text-primary">
              {activeSession.project_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{activeSession.project_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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
                    <span className="text-destructive">
                      {activeSession.error_count} error{activeSession.error_count !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
            {refreshing && <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin flex-shrink-0" />}
          </div>
        )}

        {/* Scrollable thread */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <Skeleton
                    className={`h-14 ${i % 3 === 0 ? 'w-2/3' : 'w-3/4'} rounded-2xl`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
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
    </SessionViewShell>
  );
}
