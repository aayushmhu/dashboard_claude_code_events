'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, ChevronDown, ChevronRight, FileText, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { formatTokens, formatDuration } from '@/lib/utils';

// ─── Shared primitives ────────────────────────────────────────────────────────

const PROSE = 'prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-pre:my-2 prose-headings:my-2 prose-pre:overflow-x-auto prose-code:break-words';

function CollapseButton({ expanded, onToggle, label }: { expanded: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full px-4 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {label}
    </button>
  );
}

function SystemCard({
  accent,
  children,
  bgAlpha = '0.06',
}: {
  accent: string;
  children: React.ReactNode;
  bgAlpha?: string;
}) {
  const rgb = hexToRgb(accent);
  return (
    <div className="flex justify-center my-4 px-4">
      <div
        className="w-full max-w-[82%] rounded-xl text-sm overflow-hidden"
        style={{
          background: `rgba(${rgb},${bgAlpha})`,
          border: `1px solid ${accent}30`,
          borderLeft: `3px solid ${accent}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function Divider({ accent }: { accent: string }) {
  return <div style={{ borderTop: `1px solid ${accent}20` }} />;
}

// ─── Task Notification Card ───────────────────────────────────────────────────

function parseTaskNotification(content: string) {
  return {
    taskId:      content.match(/<task-id>(.*?)<\/task-id>/)?.[1],
    status:      content.match(/<status>(.*?)<\/status>/)?.[1],
    summary:     content.match(/<summary>(.*?)<\/summary>/)?.[1],
    result:      content.match(/<result>([\s\S]*?)<\/result>/)?.[1],
    totalTokens: content.match(/<total_tokens>(.*?)<\/total_tokens>/)?.[1],
    toolUses:    content.match(/<tool_uses>(.*?)<\/tool_uses>/)?.[1],
    durationMs:  content.match(/<duration_ms>(.*?)<\/duration_ms>/)?.[1],
  };
}

export function TaskNotificationCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const d = parseTaskNotification(content);

  const isCompleted = d.status === 'completed';
  const accent = isCompleted ? '#10B981' : '#EF4444';
  const StatusIcon = isCompleted ? CheckCircle : XCircle;

  const tokens      = d.totalTokens ? parseInt(d.totalTokens, 10) : null;
  const toolUses    = d.toolUses    ? parseInt(d.toolUses, 10)    : null;
  const durationSec = d.durationMs  ? Math.round(parseInt(d.durationMs, 10) / 1000) : null;

  return (
    <SystemCard accent={accent}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-start gap-2 min-w-0">
          <StatusIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: accent }} />
          <span className="font-medium text-foreground leading-snug">
            {d.summary ?? 'Task notification'}
          </span>
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: `${accent}20`, color: accent }}
        >
          {isCompleted ? 'Completed' : 'Failed'}
        </span>
      </div>

      {/* Stats row */}
      {(tokens !== null || toolUses !== null || durationSec !== null) && (
        <>
          <Divider accent={accent} />
          <div className="flex items-center gap-4 px-4 py-2 text-[11px] text-muted-foreground">
            {tokens      !== null && <span>{formatTokens(tokens)} tokens</span>}
            {toolUses    !== null && <span>{toolUses} tools</span>}
            {durationSec !== null && <span>{formatDuration(durationSec)}</span>}
          </div>
        </>
      )}

      {/* Result — collapsed by default */}
      {d.result && (
        <>
          <Divider accent={accent} />
          <CollapseButton
            expanded={expanded}
            onToggle={() => setExpanded(v => !v)}
            label={expanded ? 'Hide result' : 'Show result'}
          />
          {expanded && (
            <div className="px-4 pb-3">
              <div className={PROSE}>
                <ReactMarkdown>{d.result}</ReactMarkdown>
              </div>
            </div>
          )}
        </>
      )}

      {/* Task ID */}
      {d.taskId && (
        <>
          <div style={{ borderTop: `1px solid ${accent}15` }} />
          <div className="px-4 py-1.5 text-[10px] font-mono text-muted-foreground/40">
            {d.taskId}
          </div>
        </>
      )}
    </SystemCard>
  );
}

// ─── Agent Report Card ────────────────────────────────────────────────────────

const ACCENT_REPORT = '#3B82F6';

function extractSummary(content: string): string {
  const inner = content.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
  if (inner) return inner.trim();
  // strip outermost tag if no summary tag found
  const stripped = content.replace(/^<[^>]+>\n?/, '').replace(/\n?<\/[^>]+>$/, '');
  return stripped.trim() || content.trim();
}

export function AgentReportCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const body = extractSummary(content);

  return (
    <SystemCard accent={ACCENT_REPORT}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <FileText className="h-4 w-4 shrink-0" style={{ color: ACCENT_REPORT }} />
        <span className="font-medium text-foreground">Agent Report</span>
        <span
          className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: `${ACCENT_REPORT}20`, color: ACCENT_REPORT }}
        >
          System
        </span>
      </div>

      <Divider accent={ACCENT_REPORT} />
      <CollapseButton
        expanded={expanded}
        onToggle={() => setExpanded(v => !v)}
        label={expanded ? 'Hide report' : 'View full report'}
      />
      {expanded && (
        <div className="px-4 pb-3">
          <div className={PROSE}>
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        </div>
      )}
    </SystemCard>
  );
}

// ─── Agent Message Card ───────────────────────────────────────────────────────

const ACCENT_MSG = '#8B5CF6';

function extractAgentMessageBody(content: string): string {
  const inner = content.match(/<teammate-message[^>]*>([\s\S]*?)<\/teammate-message>/)?.[1];
  if (inner) return inner.trim();
  const stripped = content.replace(/^<[^>]+>\n?/, '').replace(/\n?<\/[^>]+>$/, '');
  return stripped.trim() || content.trim();
}

export function AgentMessageCard({ content }: { content: string }) {
  const body = extractAgentMessageBody(content);

  return (
    <SystemCard accent={ACCENT_MSG}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <MessageSquare className="h-4 w-4 shrink-0" style={{ color: ACCENT_MSG }} />
        <span className="font-medium text-foreground">Agent Message</span>
        <span
          className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: `${ACCENT_MSG}20`, color: ACCENT_MSG }}
        >
          Inter-agent
        </span>
      </div>

      <Divider accent={ACCENT_MSG} />
      <div className="px-4 py-3">
        <div className={PROSE}>
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      </div>
    </SystemCard>
  );
}
