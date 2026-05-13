'use client';

import { useState } from 'react';
import { Event } from '@/lib/types';
import { formatRelativeTime, formatAbsoluteTime, formatTokens, calcCost, formatCost, formatAgentName, getAgentIconType, detectMessageType } from '@/lib/utils';
import { BUBBLE_COLORS, ROLE_COLORS, getAgentColor } from '@/lib/colors';
import { ToolCallCard } from '@/components/tool-call-card';
import { TaskNotificationCard, AgentReportCard, AgentMessageCard } from '@/components/task-notification-card';
import ReactMarkdown from 'react-markdown';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Bot, User, Play, BellRing, Crown, ShieldCheck, FlaskConical, Server, Layout, Cloud, Database, FileText, Brain, ChevronDown, ChevronRight } from 'lucide-react';

function getAgentIconComponent(iconType: string): React.ElementType {
  switch (iconType) {
    case 'crown':        return Crown;
    case 'shield-check': return ShieldCheck;
    case 'flask-conical':return FlaskConical;
    case 'server':       return Server;
    case 'layout':       return Layout;
    case 'cloud':        return Cloud;
    case 'database':     return Database;
    case 'file-text':    return FileText;
    default:             return Bot;
  }
}

function ThinkingPanel({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const lines = content.split('\n');
  const preview = lines.slice(0, 4).join('\n');
  const hasMore = lines.length > 4;
  return (
    <div className="mb-2 rounded-xl overflow-hidden" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <Brain className="h-3.5 w-3.5 shrink-0" style={{ color: '#A78BFA' }} />
        <span className="text-[11px] font-medium" style={{ color: '#A78BFA' }}>Claude&apos;s reasoning</span>
        <span className="ml-auto">
          {open ? <ChevronDown className="h-3 w-3" style={{ color: '#A78BFA' }} /> : <ChevronRight className="h-3 w-3" style={{ color: '#A78BFA' }} />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words leading-relaxed font-mono italic overflow-y-auto" style={{ maxHeight: 320 }}>
            {content}
          </pre>
        </div>
      )}
      {!open && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-muted-foreground/60 whitespace-pre-wrap break-words font-mono italic">{preview}</pre>
          {hasMore && <span className="text-[10px]" style={{ color: '#A78BFA' }}>…click to expand</span>}
        </div>
      )}
    </div>
  );
}

interface ConversationThreadProps {
  events: Event[];
  thinkingByEventId?: Map<number, string>;
}

function Timestamp({ ts }: { ts: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-[11px] text-muted-foreground/70 cursor-default shrink-0 leading-none">
          {formatRelativeTime(ts)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{formatAbsoluteTime(ts)}</TooltipContent>
    </Tooltip>
  );
}

export function ConversationThread({ events, thinkingByEventId }: ConversationThreadProps) {
  const rendered: React.ReactNode[] = [];
  const skipIds = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (skipIds.has(event.id)) continue;

    if (event.event_type === 'SessionStart') {
      rendered.push(
        <div key={event.id} className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border/60" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 bg-muted/30 rounded-full px-3 py-1 border border-border/40">
            <Play className="h-2.5 w-2.5" />
            <span>Session started</span>
            <span>·</span>
            <Timestamp ts={event.timestamp} />
          </div>
          <div className="h-px flex-1 bg-border/60" />
        </div>
      );
      continue;
    }

    if (event.event_type === 'Notification') {
      rendered.push(
        <div key={event.id} className="flex justify-center my-3">
          <div
            className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5"
            style={{
              background: BUBBLE_COLORS.system.bg,
              border: `1px solid ${BUBBLE_COLORS.system.border}`,
              color: ROLE_COLORS.system,
              fontStyle: 'italic',
            }}
          >
            <BellRing className="h-3 w-3" />
            <span className="text-foreground/70">{event.content}</span>
          </div>
        </div>
      );
      continue;
    }

    if (event.event_type === 'UserPromptSubmit') {
      const msgType = detectMessageType(event.content || '');
      if (msgType === 'task-notification') {
        rendered.push(<TaskNotificationCard key={event.id} content={event.content || ''} />);
        continue;
      }
      if (msgType === 'agent-report') {
        rendered.push(<AgentReportCard key={event.id} content={event.content || ''} />);
        continue;
      }
      if (msgType === 'agent-message') {
        rendered.push(<AgentMessageCard key={event.id} content={event.content || ''} />);
        continue;
      }
      rendered.push(
        <div key={event.id} className="flex flex-col items-end gap-1.5 my-4 px-4">
          <div className="flex items-center gap-2">
            <Timestamp ts={event.timestamp} />
            <div className="flex items-center gap-1 text-xs font-medium" style={{ color: ROLE_COLORS.user }}>
              <User className="h-3 w-3" />
              <span>You</span>
            </div>
          </div>
          <div
            className="max-w-[78%] rounded-2xl rounded-tr-md px-4 py-3 text-sm text-foreground"
            style={{
              background: BUBBLE_COLORS.user.bg,
              border: `1px solid ${BUBBLE_COLORS.user.border}`,
            }}
          >
            {event.content}
          </div>
        </div>
      );
      continue;
    }

    if (event.event_type === 'Stop' || event.event_type === 'SubagentStop') {
      const isSubagent = event.event_type === 'SubagentStop';

      if (isSubagent) {
        const agentName = event.agent || 'subagent';
        const displayName = formatAgentName(agentName);
        const agentColor = getAgentColor(agentName);
        const AgentIcon = getAgentIconComponent(getAgentIconType(agentName));

        const agentThinking = thinkingByEventId?.get(event.id);
        rendered.push(
          <div key={event.id} className="flex flex-col items-start gap-1.5 my-4 px-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: agentColor.text }}>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: agentColor.bg }}
                >
                  <AgentIcon className="h-3 w-3" style={{ color: agentColor.text }} />
                </div>
                <span>{displayName}</span>
                <span
                  className="text-[10px] px-1.5 py-0 rounded"
                  style={{ background: agentColor.bg, border: `1px solid ${agentColor.border}`, color: agentColor.text }}
                >
                  agent
                </span>
              </div>
              <Timestamp ts={event.timestamp} />
            </div>
            <div className="max-w-[82%] min-w-0 w-full">
              {agentThinking && <ThinkingPanel content={agentThinking} />}
              <div
                className="min-w-0 overflow-hidden rounded-2xl rounded-tl-md px-4 py-3 text-sm"
                style={{
                  background: agentColor.bg,
                  border: `1px solid ${agentColor.border}`,
                  borderLeft: `3px solid ${agentColor.text}`,
                }}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-pre:my-2 prose-headings:my-2 prose-pre:overflow-x-auto prose-code:break-words">
                  <ReactMarkdown>{event.content || ''}</ReactMarkdown>
                </div>
              </div>
            </div>
            {event.total_tokens ? (
              <div className="ml-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground/50 bg-muted/30 border border-border/20 rounded-full px-2 py-0.5 font-mono">
                  {formatTokens(event.total_tokens)} tokens
                  {event.input_tokens && event.output_tokens
                    ? ` · ${formatCost(calcCost(event.input_tokens, event.output_tokens, event.cache_creation_tokens ?? 0, event.cache_read_tokens ?? 0, event.model))}`
                    : ''}
                </span>
              </div>
            ) : null}
          </div>
        );
      } else {
        const thinking = thinkingByEventId?.get(event.id);
        rendered.push(
          <div key={event.id} className="flex flex-col items-start gap-1.5 my-4 px-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ROLE_COLORS.assistant }}>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: `${ROLE_COLORS.assistant}20` }}
                >
                  <Bot className="h-3 w-3" style={{ color: ROLE_COLORS.assistant }} />
                </div>
                <span>Claude</span>
              </div>
              <Timestamp ts={event.timestamp} />
            </div>
            <div className="max-w-[82%] min-w-0 w-full">
              {thinking && <ThinkingPanel content={thinking} />}
              <div
                className="min-w-0 overflow-hidden rounded-2xl rounded-tl-md px-4 py-3 text-sm"
                style={{
                  background: BUBBLE_COLORS.assistant.bg,
                  border: `1px solid ${BUBBLE_COLORS.assistant.border}`,
                }}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-pre:my-2 prose-headings:my-2 prose-pre:overflow-x-auto prose-code:break-words">
                  <ReactMarkdown>{event.content || ''}</ReactMarkdown>
                </div>
              </div>
            </div>
            {event.total_tokens ? (
              <div className="ml-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground/50 bg-muted/30 border border-border/20 rounded-full px-2 py-0.5 font-mono">
                  {formatTokens(event.total_tokens)} tokens
                  {event.input_tokens && event.output_tokens
                    ? ` · ${formatCost(calcCost(event.input_tokens, event.output_tokens, event.cache_creation_tokens ?? 0, event.cache_read_tokens ?? 0, event.model))}`
                    : ''}
                </span>
              </div>
            ) : null}
          </div>
        );
      }
      continue;
    }

    if (event.event_type === 'PreToolUse') {
      const post = events.slice(i + 1).find(
        (e) => e.event_type === 'PostToolUse' && e.tool_name === event.tool_name
      );
      if (post) skipIds.add(post.id);

      rendered.push(
        <div key={event.id} className="my-2 px-4">
          <div className="max-w-[88%]">
            <ToolCallCard
              toolName={event.tool_name || 'Unknown'}
              toolInput={event.tool_input}
              toolOutput={post?.tool_output ?? null}
              isError={post?.is_error ?? false}
              errorMessage={post?.error_message ?? null}
              timestamp={event.timestamp}
            />
          </div>
        </div>
      );
      continue;
    }

    if (event.event_type === 'PostToolUse') {
      rendered.push(
        <div key={event.id} className="my-2 px-4">
          <div className="max-w-[88%]">
            <ToolCallCard
              toolName={event.tool_name || 'Unknown'}
              toolInput={event.tool_input}
              toolOutput={event.tool_output}
              isError={event.is_error}
              errorMessage={event.error_message}
              timestamp={event.timestamp}
            />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col py-4 space-y-0.5">
      {rendered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Bot className="h-8 w-8 opacity-20" />
          <p className="text-sm">No events in this session</p>
        </div>
      )}
      {rendered}
    </div>
  );
}
