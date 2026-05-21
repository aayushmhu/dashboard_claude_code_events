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
  ChevronDown,
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
  /** Event id to focus on initial load (from ?focus= query param) */
  focusEventId?: string;
}

export function ConversationsClient({ sessions, selectedId, focusEventId }: ConversationsClientProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [thinkingByEventId, setThinkingByEventId] = useState<Map<number, string>>(new Map());
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [hasMoreNewer, setHasMoreNewer] = useState(false);
  const [focusedEventId, setFocusedEventId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);
  const activeIdRef = useRef(selectedId);
  activeIdRef.current = selectedId;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  // Track whether we're in focus mode (don't auto-scroll to bottom after load)
  const focusModeRef = useRef(false);
  // Guard so the scroll-to-focus fires at most once per focusedEventId (growing events must not re-snap)
  const lastScrolledFocusRef = useRef<number | null>(null);

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
    async (sessionId: string, targetFocusId?: number) => {
      setLoading(true);
      try {
        const evUrl = targetFocusId
          ? `/api/sessions/${sessionId}/events?focus_id=${targetFocusId}`
          : `/api/sessions/${sessionId}/events?limit=50`;

        const [evRes, trRes] = await Promise.all([
          fetch(evUrl),
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
        setHasMoreOlder(data.has_more_older ?? data.has_more ?? false);
        setHasMoreNewer(data.has_more_newer ?? false);
        if (targetFocusId) {
          setFocusedEventId(targetFocusId);
          focusModeRef.current = true;
        } else {
          setFocusedEventId(null);
          focusModeRef.current = false;
        }
        return evts.length;
      } catch {
        setEvents([]);
        setThinkingByEventId(new Map());
        setHasMoreOlder(false);
        setHasMoreNewer(false);
        return 0;
      } finally {
        setLoading(false);
      }
    },
    [buildThinkingMap]
  );

  const loadOlderEvents = useCallback(async () => {
    const sessionId = activeIdRef.current;
    const current = eventsRef.current;
    if (!sessionId || current.length === 0) return;

    setLoadingOlder(true);
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;
    const oldestId = current[0].id;

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/events?before_id=${oldestId}&limit=50`
      );
      const data = await res.json();
      const older: Event[] = data.events ?? [];
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setHasMoreOlder(data.has_more_older ?? data.has_more ?? false);
      setEvents((cur) => [...older, ...cur]);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
        }
      });
    } catch {
      // silent
    } finally {
      setLoadingOlder(false);
    }
  }, []);

  const loadNewerEvents = useCallback(async () => {
    const sessionId = activeIdRef.current;
    const current = eventsRef.current;
    if (!sessionId || current.length === 0) return;

    setLoadingNewer(true);
    const newestId = current[current.length - 1].id;

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/events?after_id=${newestId}&limit=50`
      );
      const data = await res.json();
      const newer: Event[] = data.events ?? [];
      if (newer.length === 0) {
        setHasMoreNewer(false);
        return;
      }
      setHasMoreNewer(data.has_more_newer ?? false);
      setEvents((cur) => [...cur, ...newer]);
    } catch {
      // silent
    } finally {
      setLoadingNewer(false);
    }
  }, []);

  // Load events when session or focus changes, scroll to bottom (or to focused event)
  useEffect(() => {
    if (!selectedId) return;
    setEvents([]);
    setHasMoreOlder(false);
    setHasMoreNewer(false);
    setFocusedEventId(null);
    focusModeRef.current = false;
    prevEventCount.current = 0;
    const targetFocusId = focusEventId ? parseInt(focusEventId, 10) : undefined;
    loadEvents(selectedId, targetFocusId).then(() => {
      if (!targetFocusId) {
        // No focus: scroll to bottom (existing behavior)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (container) container.scrollTop = container.scrollHeight;
          });
        });
      }
      // If targetFocusId: the highlight effect handles scrollIntoView
    });
  }, [selectedId, focusEventId, loadEvents]);

  // Focus highlight: scroll target into view + apply amber outline for 2s
  useEffect(() => {
    if (!focusedEventId) return;
    if (lastScrolledFocusRef.current === focusedEventId) return; // already scrolled to this focus; growing events must not re-snap
    const el = document.getElementById(`event-${focusedEventId}`);
    if (!el) return; // DOM not ready yet; will retry on next events.length change
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    el.setAttribute('data-focused', 'true');
    lastScrolledFocusRef.current = focusedEventId;
    const timer = setTimeout(() => el.removeAttribute('data-focused'), 2000);
    return () => clearTimeout(timer);
  }, [focusedEventId, events.length]);

  // Scroll to bottom when auto-refresh appends new events (only in non-focus mode)
  useEffect(() => {
    if (events.length === 0 || events.length <= prevEventCount.current) return;
    if (prevEventCount.current > 0 && !focusModeRef.current) {
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
      if (container.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
        loadOlderEvents();
      }
      const distFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distFromBottom < 120 && hasMoreNewer && !loadingNewer) {
        loadNewerEvents();
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMoreOlder, hasMoreNewer, loadingOlder, loadingNewer, loadOlderEvents, loadNewerEvents]);

  // Auto-refresh every 15s (only append newer events, only in non-focus mode)
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
          const prevIds = new Set(prev.map((e) => e.id));
          const newer = fresh.filter((e) => !prevIds.has(e.id));
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

  // Panel-mode onScrollToEvent: focus-load the target if not already in view
  const handleScrollToEvent = useCallback(
    (eventId: number) => {
      const el = document.getElementById(`event-${eventId}`);
      if (el) {
        // Already rendered: just scroll + highlight
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.setAttribute('data-focused', 'true');
        setTimeout(() => el.removeAttribute('data-focused'), 2000);
      } else {
        // Not rendered: re-load centered on the target event
        const sessionId = activeIdRef.current;
        if (!sessionId) return;
        setEvents([]);
        setHasMoreOlder(false);
        setHasMoreNewer(false);
        prevEventCount.current = 0;
        loadEvents(sessionId, eventId);
      }
    },
    [loadEvents]
  );

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
              {/* Upward load sentinel */}
              {hasMoreOlder && (
                <div className="flex justify-center py-3">
                  {loadingOlder ? (
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
              <ConversationThread
                events={events}
                thinkingByEventId={thinkingByEventId}
              />
              {/* Downward load sentinel */}
              {hasMoreNewer && (
                <div className="flex justify-center py-3">
                  {loadingNewer ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Loading newer events…
                    </div>
                  ) : (
                    <button
                      onClick={loadNewerEvents}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className="h-3 w-3" />
                      Load newer events
                    </button>
                  )}
                </div>
              )}
              <div ref={threadEndRef} className="h-6" />
            </>
          )}
        </div>
      </>
    </SessionViewShell>
  );
}
