import type { Metadata } from 'next';
import { Header } from '@/components/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConversationThread } from '@/components/conversation-thread';
import { Badge } from '@/components/ui/badge';
import { formatDuration, formatTokens, formatRelativeTime } from '@/lib/utils';
import { Clock, Zap, AlertCircle, ArrowLeft, Coins, Terminal, Monitor, Code2, GitBranch, Brain, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { Event, Session } from '@/lib/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Session ${id.slice(0, 8)}` };
}

async function getData(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const [session, events] = await Promise.all([
    fetch(`${base}/api/sessions/${id}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    fetch(`${base}/api/sessions/${id}/events`, { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
  ]);
  return { session, events };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, events } = await getData(id);

  if (session?.error) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Session" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Session not found.</p>
        </div>
      </div>
    );
  }

  const eventsArr = Array.isArray(events) ? (events as Event[]) : [];
  const sess = session as Session & { model?: string; thinking_count?: number; image_count?: number; entrypoint?: string | null; git_branch?: string | null };

  return (
    <div className="flex flex-col h-full">
      <Header title="Session Detail" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-4 overflow-y-auto">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sessions
        </Link>

        {/* Summary card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1.5">
                <p className="font-semibold text-base">{sess.project_name || 'Unknown project'}</p>
                <p className="text-xs text-muted-foreground font-mono">{sess.session_id}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {sess.model && (
                    <Badge variant="secondary" className="text-xs">
                      {sess.model.replace('claude-', '').replace(/-\d{8}$/, '')}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Started {formatRelativeTime(sess.started_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(sess.duration_seconds)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  {sess.event_count} events
                </span>
                {(sess.total_tokens ?? 0) > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5" />
                    {formatTokens(sess.total_tokens)}
                  </span>
                )}
                {sess.error_count > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {sess.error_count} error{sess.error_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Transcript metadata badges */}
            {(sess.entrypoint || sess.git_branch || (sess.thinking_count ?? 0) > 0 || (sess.image_count ?? 0) > 0) && (
              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border/30">
                {sess.entrypoint && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/40">
                    {sess.entrypoint === 'vscode' ? <Monitor className="h-3 w-3" /> : sess.entrypoint === 'sdk' || sess.entrypoint === 'sdk-cli' ? <Code2 className="h-3 w-3" /> : <Terminal className="h-3 w-3" />}
                    {sess.entrypoint === 'vscode' ? 'VS Code' : sess.entrypoint === 'sdk' || sess.entrypoint === 'sdk-cli' ? 'SDK' : 'CLI'}
                  </span>
                )}
                {sess.git_branch && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <GitBranch className="h-3 w-3" />
                    {sess.git_branch}
                  </span>
                )}
                {(sess.thinking_count ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-violet-400/80 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20">
                    <Brain className="h-3 w-3" />
                    {sess.thinking_count} thinking block{sess.thinking_count !== 1 ? 's' : ''}
                  </span>
                )}
                {(sess.image_count ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-blue-400/80 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                    <ImageIcon className="h-3 w-3" />
                    {sess.image_count} image{sess.image_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversation thread */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ConversationThread events={eventsArr} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
