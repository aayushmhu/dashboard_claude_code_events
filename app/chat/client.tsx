'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MonacoEditor from '@monaco-editor/react';
import {
  Bot, User, Send, Square, Plus, Terminal, FolderOpen, Folder,
  Copy, Check, AlertTriangle, ChevronDown, ChevronRight, BellRing,
  RefreshCw, AlertCircle, Clock, Coins, Settings,
  File, FileText, FileCode, X, Pencil, FilePlus, FolderPlus,
  Eye, ImageIcon, AtSign, Slash, Paperclip,
  Crown, ShieldCheck, FlaskConical, Server, Layout, Cloud, Database, Lock, PauseCircle,
  Brain, GitBranch, Shield, ZoomIn,
} from 'lucide-react';
import { TOOL_COLORS, BUBBLE_COLORS, ROLE_COLORS, getAgentColor } from '@/lib/colors';
import { formatCost, formatRelativeTime, formatDuration, formatTokens, truncateId, parseDbDate, formatAgentName, getAgentIconType, detectMessageType, calcCost } from '@/lib/utils';
import { ToolCallCard } from '@/components/tool-call-card';
import { TaskNotificationCard, AgentReportCard, AgentMessageCard } from '@/components/task-notification-card';
import { Session, Event } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptRecord {
  id: number;
  record_index: number;
  record_type: string;
  record_subtype: string;
  uuid: string | null;
  parent_uuid: string | null;
  timestamp: string | null;
  content_text: string | null;
  content_image: string | null;   // base64 string for image/document subtypes
  image_media_type: string | null;
  model: string | null;
  permission_mode: string | null;
  is_sidechain: boolean;
  is_error: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | 'permission_denial' | 'permission_change' | 'api_error' | 'compact_boundary';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isError?: boolean;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string | Record<string, unknown> | null;
  toolIsError?: boolean;
  agentType?: string;
  agentName?: string;
  permissionDenial?: { tool_name: string; tool_input: Record<string, unknown> };
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
  notificationType?: string;
  attachedImages?: string[];   // base64 dataUrls for display
  mentionedFiles?: string[];   // relative paths for display
  // Transcript-derived enrichment
  thinkingContent?: string;                                          // thinking block for this turn
  transcriptImages?: { data: string; mediaType: string }[];         // images from transcript
  permissionMode?: string;                                          // for permission_change role
  isHistorical?: boolean;                                           // loaded from DB, not live
  rejectionReason?: string;                                         // from transcript rejection record
  permissionOutcome?: 'rejected' | 'mode_changed' | 'instructions_given';
  permissionModeAfter?: string;                                     // which mode was set (for mode_changed)
  model?: string;                                                   // model that produced this turn
}

// ─── Slash commands ───────────────────────────────────────────────────────────

interface SlashCommand { name: string; desc: string; local: boolean; }

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear',   desc: 'Clear the conversation',                   local: true  },
  { name: 'help',    desc: 'Show available commands and tips',          local: true  },
  { name: 'cost',    desc: 'Show session token cost',                   local: true  },
  { name: 'model',   desc: 'Change the AI model',                      local: true  },
  { name: 'compact', desc: 'Compact and summarize the conversation',    local: false },
  { name: 'review',  desc: 'Review recent code changes',               local: false },
  { name: 'init',    desc: 'Create or update CLAUDE.md for this project', local: false },
  { name: 'memory',  desc: 'Check and update memory files',            local: false },
];

interface DirectoryOption { path: string; name: string; }
interface DirectoriesResponse {
  recentProjects: Array<{ project_dir: string; project_name: string }>;
  availableDirectories: DirectoryOption[];
}

interface TreeEntry { name: string; path: string; type: 'file' | 'directory'; }
interface OpenFile { path: string; name: string; content: string; language: string; lines: number; size: number; isBinary?: boolean; tooLarge?: boolean; isPdf?: boolean; isImage?: boolean; }

// ─── File icon helpers ────────────────────────────────────────────────────────

function fileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const m: Record<string, string> = {
    ts: '#3178c6', tsx: '#61dafb', js: '#f0db4f', jsx: '#61dafb',
    py: '#3572a5', rs: '#dea584', go: '#00add8', java: '#b07219',
    css: '#563d7c', scss: '#c6538c', html: '#e34c26', json: '#f59e0b',
    md: '#6b7280', sh: '#89e051', sql: '#e38c00', yaml: '#f59e0b',
    yml: '#f59e0b', toml: '#9c4221', vue: '#42b883', svelte: '#ff3e00',
    env: '#6b7280',
  };
  return m[ext] || '#8592a5';
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'kt', 'rb', 'php', 'c', 'cpp', 'h', 'swift', 'vue', 'svelte', 'sh'];
  const textExts = ['md', 'txt', 'rst', 'html', 'xml'];
  const color = fileColor(name);
  const Icon = codeExts.includes(ext) ? FileCode : textExts.includes(ext) ? FileText : File;
  return <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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

const MONACO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
  '.css': 'css', '.scss': 'scss', '.html': 'html', '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.sh': 'shell',
  '.sql': 'sql', '.toml': 'toml', '.xml': 'xml', '.rb': 'ruby',
  '.php': 'php', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.swift': 'swift',
  '.vue': 'html', '.svelte': 'html', '.graphql': 'graphql', '.prisma': 'prisma',
  '.env': 'ini', '.txt': 'plaintext', '.lock': 'plaintext',
};

function getMonacoLang(filename: string): string {
  const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '');
  return MONACO_LANG[ext] || 'plaintext';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLive(lastSeenAt: string): boolean {
  const d = parseDbDate(lastSeenAt);
  const t = d.getTime();
  return !isNaN(t) && t <= Date.now() && Date.now() - t < 3 * 60 * 1000;
}

// Merges transcript-derived data (thinking, images, permission changes, api errors)
// into the base messages array produced by eventsToMessages().
function mergeTranscriptIntoMessages(
  msgs: ChatMessage[],
  events: Event[],
  transcriptRecords: TranscriptRecord[],
): ChatMessage[] {
  if (transcriptRecords.length === 0) return msgs;

  // ── 0. Compute loaded-event time window ───────────────────────────────────
  // Transcript records span the full session; events are paginated.
  // Only inject records that fall within (or just before) the loaded event range.
  const eventTimes = msgs.map(m => m.timestamp.getTime()).filter(t => !isNaN(t));
  const minEventTime = eventTimes.length > 0 ? Math.min(...eventTimes) : -Infinity;
  const maxEventTime = eventTimes.length > 0 ? Math.max(...eventTimes) : Infinity;
  // 60-min lead: thinking/compact records fire before the next logged cc_event
  const LEAD_MS = 60 * 60 * 1000;
  function withinEventWindow(ts: Date): boolean {
    const t = ts.getTime();
    return !isNaN(t) && t >= minEventTime - LEAD_MS && t <= maxEventTime + LEAD_MS;
  }

  // ── 1. Attach thinking blocks to assistant messages ──────────────────────
  const thinkingRecords = transcriptRecords.filter(r => r.record_subtype === 'thinking' && r.content_text);
  if (thinkingRecords.length > 0) {
    const stopEvents = events.filter(e => e.event_type === 'Stop' || e.event_type === 'SubagentStop');
    // Match each thinking block to the nearest Stop event after it.
    // Extended-thinking sessions can think for 30+ minutes before the Stop fires,
    // so use a 90-minute window. Concatenate multiple thinking blocks per turn.
    for (const tr of thinkingRecords) {
      if (!tr.timestamp) continue;
      const ts = parseDbDate(tr.timestamp);
      if (!withinEventWindow(ts)) continue;
      const trTime = ts.getTime();
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
        const msg = msgs.find(m => m.id === String(best!.id));
        if (msg) {
          msg.thinkingContent = msg.thinkingContent
            ? msg.thinkingContent + '\n\n' + (tr.content_text ?? '')
            : (tr.content_text ?? undefined);
        }
      }
    }
  }

  // ── 2. Attach transcript images to user messages ──────────────────────────
  const imageRecords = transcriptRecords.filter(
    r => (r.record_subtype === 'image' || r.record_subtype === 'document') && r.content_image
  );
  if (imageRecords.length > 0) {
    const userEvents = events.filter(e => e.event_type === 'UserPromptSubmit');
    for (const ir of imageRecords) {
      if (!ir.timestamp || !ir.content_image) continue;
      const irTime = parseDbDate(ir.timestamp).getTime();
      let best: Event | null = null;
      let bestDiff = Infinity;
      for (const ue of userEvents) {
        const diff = Math.abs(parseDbDate(ue.timestamp).getTime() - irTime);
        if (diff < 10000 && diff < bestDiff) {
          best = ue;
          bestDiff = diff;
        }
      }
      if (best) {
        const msg = msgs.find(m => m.id === String(best!.id));
        if (msg) {
          if (!msg.transcriptImages) msg.transcriptImages = [];
          msg.transcriptImages.push({ data: ir.content_image, mediaType: ir.image_media_type ?? 'image/png' });
        }
      }
    }
  }

  // ── 3. Match rejection records to permission_denial messages ─────────────
  const rejectionRecords = transcriptRecords.filter(r => r.record_subtype === 'rejection' && r.content_text);
  if (rejectionRecords.length > 0) {
    const denialMsgs = msgs.filter(m => m.role === 'permission_denial');
    for (const rr of rejectionRecords) {
      if (!rr.timestamp) continue;
      const rrTime = parseDbDate(rr.timestamp).getTime();
      let best: ChatMessage | null = null;
      let bestDiff = Infinity;
      for (const dm of denialMsgs) {
        const diff = Math.abs(dm.timestamp.getTime() - rrTime);
        if (diff < 30000 && diff < bestDiff) { best = dm; bestDiff = diff; }
      }
      if (best && !best.rejectionReason) {
        best.rejectionReason = rr.content_text ?? undefined;
      }
    }
  }

  // ── 4. Inject permission mode changes, api errors, compact boundaries ────
  // withinEventWindow() defined in step 0 filters to the loaded event range.
  const permRecords = transcriptRecords.filter(r => r.record_type === 'permission-mode' && r.permission_mode);
  const apiErrRecords = transcriptRecords.filter(r => r.record_subtype === 'api_error');
  const injected: ChatMessage[] = [];

  for (const pr of permRecords) {
    if (!pr.timestamp) continue;
    const ts = parseDbDate(pr.timestamp);
    if (!withinEventWindow(ts)) continue;
    injected.push({
      id: `perm-${pr.id}`,
      role: 'permission_change',
      content: pr.permission_mode ?? '',
      permissionMode: pr.permission_mode ?? undefined,
      timestamp: ts,
    });
  }
  for (const ae of apiErrRecords) {
    if (!ae.timestamp) continue;
    const ts = parseDbDate(ae.timestamp);
    if (!withinEventWindow(ts)) continue;
    injected.push({
      id: `apierr-${ae.id}`,
      role: 'api_error',
      content: ae.content_text ?? 'API error',
      timestamp: ts,
    });
  }

  const compactRecords = transcriptRecords.filter(r => r.record_subtype === 'compact_boundary');
  for (const cr of compactRecords) {
    if (!cr.timestamp) continue;
    const ts = parseDbDate(cr.timestamp);
    if (!withinEventWindow(ts)) continue;
    injected.push({
      id: `compact-${cr.id}`,
      role: 'compact_boundary',
      content: cr.content_text ?? '',
      timestamp: ts,
    });
  }

  const sorted = injected.length === 0
    ? msgs
    : [...msgs, ...injected].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Post-process: determine what the user did after each permission request
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (m.role !== 'permission_denial') continue;
    if (m.rejectionReason) { m.permissionOutcome = 'rejected'; continue; }
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      if (next.timestamp.getTime() - m.timestamp.getTime() > 60_000) break;
      if (next.role === 'permission_change') {
        m.permissionOutcome = 'mode_changed';
        m.permissionModeAfter = next.permissionMode;
        break;
      }
      if (next.role === 'user' && next.isHistorical && next.content?.trim()) {
        m.permissionOutcome = 'instructions_given';
        break;
      }
    }
  }

  return sorted;
}

function eventsToMessages(events: Event[]): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  const skipIds = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (skipIds.has(ev.id)) continue;
    if (ev.event_type === 'UserPromptSubmit') {
      msgs.push({ id: String(ev.id), role: 'user', content: ev.content || '', timestamp: parseDbDate(ev.timestamp), isHistorical: true });
    } else if (ev.event_type === 'Stop' || ev.event_type === 'SubagentStop') {
      msgs.push({
        id: String(ev.id), role: 'assistant', content: ev.content || '',
        timestamp: parseDbDate(ev.timestamp),
        isHistorical: true,
        agentType: ev.event_type === 'SubagentStop'
          ? ((ev.raw_payload as Record<string, unknown>)?.agent_type as string) || 'subagent'
          : undefined,
        agentName: ev.event_type === 'SubagentStop' ? (ev.agent || 'subagent') : undefined,
        inputTokens: ev.input_tokens ?? undefined,
        outputTokens: ev.output_tokens ?? undefined,
        cacheCreationTokens: ev.cache_creation_tokens ?? undefined,
        cacheReadTokens: ev.cache_read_tokens ?? undefined,
        totalTokens: ev.total_tokens ?? undefined,
        model: ev.model ?? undefined,
      });
    } else if (ev.event_type === 'PreToolUse') {
      const post = events.slice(i + 1).find(e => e.event_type === 'PostToolUse' && e.tool_name === ev.tool_name);
      if (post) {
        skipIds.add(post.id);
        msgs.push({
          id: String(ev.id), role: 'tool', content: '',
          toolName: ev.tool_name || 'Unknown',
          toolInput: ev.tool_input ?? undefined,
          toolOutput: post.tool_output ?? null,
          toolIsError: post.is_error ?? false,
          timestamp: parseDbDate(ev.timestamp),
          isHistorical: true,
        });
      } else {
        msgs.push({
          id: String(ev.id), role: 'permission_denial', content: '',
          toolName: ev.tool_name || 'Unknown',
          toolInput: ev.tool_input ?? undefined,
          permissionDenial: { tool_name: ev.tool_name || 'Unknown', tool_input: (ev.tool_input ?? {}) as Record<string, unknown> },
          timestamp: parseDbDate(ev.timestamp),
          isHistorical: true,
        });
      }
    } else if (ev.event_type === 'Notification') {
      msgs.push({ id: String(ev.id), role: 'system', content: ev.content || '', timestamp: parseDbDate(ev.timestamp), notificationType: ev.notification_type ?? undefined, isHistorical: true });
    }
  }
  return msgs;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground">—</span>;
  let display: string;
  if (typeof data === 'string') {
    display = data.length > 3000 ? data.slice(0, 3000) + '\n…(truncated)' : data;
  } else {
    const str = JSON.stringify(data, null, 2);
    display = str.length > 4000 ? str.slice(0, 4000) + '\n…(truncated)' : str;
  }
  return (
    <pre className="overflow-x-auto rounded-md p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto" style={{ background: 'rgba(0,0,0,0.15)' }}>
      {display}
    </pre>
  );
}

function Collapsible({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && children}
    </div>
  );
}

function ChatToolCard({ msg }: { msg: ChatMessage }) {
  const toolColor = TOOL_COLORS[msg.toolName ?? ''] || '#64748B';

  if (msg.isStreaming) {
    return (
      <div
        className="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
        style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid rgba(255,255,255,0.07)`, borderLeft: `3px solid ${toolColor}` }}
      >
        <span className="text-[11px] font-semibold" style={{ color: toolColor }}>{msg.toolName || 'Tool'}</span>
        <span className="text-[11px] text-muted-foreground animate-pulse">running…</span>
      </div>
    );
  }

  const output = typeof msg.toolOutput === 'string'
    ? { content: msg.toolOutput }
    : msg.toolOutput ?? null;

  return (
    <ToolCallCard
      toolName={msg.toolName || 'Unknown'}
      toolInput={msg.toolInput ?? null}
      toolOutput={output}
      isError={!!msg.toolIsError}
      errorMessage={null}
      timestamp={msg.timestamp.toISOString()}
    />
  );
}

type RetryMode = 'default' | 'acceptEdits' | 'dangerouslySkipPermissions';

function PermissionDenialCard({ msg, onRetry }: { msg: ChatMessage; onRetry?: (mode: RetryMode) => void }) {
  const d = msg.permissionDenial;
  const [expanded, setExpanded] = useState(false);
  const primaryInput = d?.tool_input
    ? (d.tool_input.command ?? d.tool_input.path ?? d.tool_input.description ?? Object.values(d.tool_input)[0])
    : null;
  const inputStr = primaryInput != null ? String(primaryInput) : null;
  const isHistorical = msg.isHistorical;

  // Determine outcome label + colors
  let outcomeLabel: string;
  let outcomeColor: string;
  let outcomeBg: string;
  let outcomeBorder: string;

  if (!isHistorical) {
    outcomeLabel = 'Permission requested';
    outcomeColor = '#F59E0B';
    outcomeBg = 'rgba(245,158,11,0.08)';
    outcomeBorder = 'rgba(245,158,11,0.25)';
  } else {
    switch (msg.permissionOutcome) {
      case 'rejected':
        outcomeLabel = 'Rejected by user';
        outcomeColor = '#EF4444';
        outcomeBg = 'rgba(239,68,68,0.08)';
        outcomeBorder = 'rgba(239,68,68,0.25)';
        break;
      case 'mode_changed': {
        const modeStr = msg.permissionModeAfter === 'acceptEdits' ? 'Accept Edits'
          : msg.permissionModeAfter === 'dangerouslySkipPermissions' ? 'Skip All Permissions'
          : msg.permissionModeAfter ?? 'changed';
        outcomeLabel = `Mode changed → ${modeStr}`;
        outcomeColor = '#818CF8';
        outcomeBg = 'rgba(129,140,248,0.08)';
        outcomeBorder = 'rgba(129,140,248,0.25)';
        break;
      }
      case 'instructions_given':
        outcomeLabel = 'User gave instructions instead';
        outcomeColor = '#60A5FA';
        outcomeBg = 'rgba(96,165,250,0.08)';
        outcomeBorder = 'rgba(96,165,250,0.25)';
        break;
      default:
        outcomeLabel = 'Permission requested';
        outcomeColor = '#F59E0B';
        outcomeBg = 'rgba(245,158,11,0.08)';
        outcomeBorder = 'rgba(245,158,11,0.25)';
    }
  }

  return (
    <div className="rounded-lg p-3 text-sm flex items-start gap-2"
      style={{ background: outcomeBg, border: `1px solid ${outcomeBorder}` }}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: outcomeColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-medium" style={{ color: outcomeColor }}>
            {outcomeLabel}
          </p>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: `${outcomeColor}22`, color: outcomeColor }}>
            {d?.tool_name}
          </span>
        </div>

        {/* Show the rejection message for historical sessions */}
        {isHistorical && msg.rejectionReason && (
          <p className="mt-1 text-[11px] text-muted-foreground/70 italic">
            {msg.rejectionReason.replace(/^The user doesn't want to proceed with this tool use\.\s*/i, '').slice(0, 200) || msg.rejectionReason.slice(0, 200)}
          </p>
        )}

        {/* Collapsible input preview */}
        {inputStr && (
          <div className="mt-1.5">
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {expanded ? 'Hide input' : 'Show what Claude asked to do'}
            </button>
            {expanded && (
              <pre className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                {inputStr}
              </pre>
            )}
          </div>
        )}

        {/* Permission retry options — show whenever onRetry is available */}
        {onRetry && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <button
              onClick={() => onRetry('default')}
              className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.35)' }}
            >
              Yes, allow once
            </button>
            <button
              onClick={() => onRetry('acceptEdits')}
              className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)' }}
            >
              Allow file edits
            </button>
            <button
              onClick={() => onRetry('dangerouslySkipPermissions')}
              className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}
            >
              Allow all ⚠
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Thinking panel ───────────────────────────────────────────────────────────

function ThinkingPanel({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const lines = content.split('\n');
  const preview = lines.slice(0, 5).join('\n');
  const hasMore = lines.length > 5;

  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Brain className="h-3.5 w-3.5 shrink-0" style={{ color: '#A78BFA' }} />
        <span className="text-[11px] font-medium" style={{ color: '#A78BFA' }}>Claude&apos;s reasoning</span>
        <span className="ml-auto">
          {open
            ? <ChevronDown className="h-3 w-3" style={{ color: '#A78BFA' }} />
            : <ChevronRight className="h-3 w-3" style={{ color: '#A78BFA' }} />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words leading-relaxed font-mono italic overflow-y-auto"
            style={{ maxHeight: 320 }}>
            {content}
          </pre>
        </div>
      )}
      {!open && hasMore && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-muted-foreground/60 whitespace-pre-wrap break-words font-mono italic">{preview}</pre>
          <span className="text-[10px]" style={{ color: '#A78BFA' }}>…click to expand</span>
        </div>
      )}
      {!open && !hasMore && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-muted-foreground/60 whitespace-pre-wrap break-words font-mono italic">{content}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Image lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({ src, mediaType, onClose }: { src: string; mediaType: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:${mediaType};base64,${src}`}
        alt="attachment"
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={onClose}>
        <X className="h-6 w-6" />
      </button>
    </div>
  );
}

function ApiErrorCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(content); } catch { /* raw string fallback */ }

  const cause = parsed?.cause as Record<string, unknown> | undefined;
  const code    = (cause?.code    as string | undefined) ?? 'API Error';
  const path    = (cause?.path    as string | undefined) ?? null;
  const message = (cause?.message as string | undefined) ?? null;

  return (
    <div className="flex justify-center my-2 px-4">
      <div className="rounded-lg text-xs max-w-xl w-full"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium shrink-0">{code}</span>
          {path && <span className="text-[11px] opacity-55 truncate">{path}</span>}
          {expanded
            ? <ChevronDown className="h-3 w-3 ml-auto shrink-0 opacity-60" />
            : <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-60" />}
        </button>
        {expanded && (
          <div className="px-3 pb-3 border-t" style={{ borderColor: 'rgba(239,68,68,0.20)' }}>
            {path && (
              <p className="mt-2 text-[11px] text-muted-foreground break-all">
                <span className="font-semibold" style={{ color: '#EF4444' }}>Path: </span>{path}
              </p>
            )}
            {message && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-semibold" style={{ color: '#EF4444' }}>Message: </span>{message}
              </p>
            )}
            <pre className="mt-2 text-[11px] font-mono text-muted-foreground/80 bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {parsed ? JSON.stringify(parsed, null, 2) : content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ msg, onRetry }: { msg: ChatMessage; onRetry?: (mode: RetryMode) => void }) {
  const [lightbox, setLightbox] = useState<{ data: string; mediaType: string } | null>(null);

  if (msg.role === 'user') {
    const msgType = detectMessageType(msg.content);
    if (msgType === 'task-notification') return <TaskNotificationCard content={msg.content} />;
    if (msgType === 'agent-report')      return <AgentReportCard      content={msg.content} />;
    if (msgType === 'agent-message')     return <AgentMessageCard     content={msg.content} />;
    const allImages: { src: string; isTranscript?: boolean; mediaType?: string }[] = [
      ...(msg.attachedImages ?? []).map(src => ({ src })),
      ...(msg.transcriptImages ?? []).map(img => ({ src: img.data, isTranscript: true, mediaType: img.mediaType })),
    ];
    return (
      <>
        {lightbox && <ImageLightbox src={lightbox.data} mediaType={lightbox.mediaType} onClose={() => setLightbox(null)} />}
        <div className="flex flex-col items-end gap-1.5 my-4 px-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/70">{formatRelativeTime(msg.timestamp.toISOString())}</span>
            <div className="flex items-center gap-1 text-xs font-medium" style={{ color: ROLE_COLORS.user }}>
              <User className="h-3 w-3" /><span>You</span>
            </div>
          </div>
          <div className="max-w-[78%] space-y-2">
            {/* Attached images (live chat + transcript) */}
            {allImages.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-end">
                {allImages.map((img, i) => (
                  <div key={i} className="relative group cursor-pointer" onClick={() => img.isTranscript && img.mediaType ? setLightbox({ data: img.src, mediaType: img.mediaType }) : undefined}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.isTranscript ? `data:${img.mediaType};base64,${img.src}` : img.src}
                      alt="attachment"
                      className="h-24 max-w-[200px] object-cover rounded-xl border border-border/50"
                    />
                    {img.isTranscript && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                        <ZoomIn className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-2xl rounded-tr-md px-4 py-3 text-sm text-foreground whitespace-pre-wrap"
              style={{ background: BUBBLE_COLORS.user.bg, border: `1px solid ${BUBBLE_COLORS.user.border}` }}>
              {msg.content.split(/(@\S+)/g).map((part, i) =>
                part.match(/^@\S+$/) ? (
                  <span key={i} className="inline-flex items-center gap-0.5 font-mono text-[11px] px-1 py-0.5 rounded align-middle"
                    style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}>
                    <File className="h-2.5 w-2.5" />{part}
                  </span>
                ) : <span key={i}>{part}</span>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (msg.role === 'assistant') {
    const isAgent = !!msg.agentName;
    const agentColor = isAgent ? getAgentColor(msg.agentName!) : null;
    const iconColor = agentColor ? agentColor.text : ROLE_COLORS.assistant;
    const AgentIcon = isAgent ? getAgentIconComponent(getAgentIconType(msg.agentName!)) : Bot;
    const displayName = isAgent ? formatAgentName(msg.agentName!) : 'Claude';

    return (
      <div className="flex flex-col items-start gap-1.5 my-4 px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: iconColor }}>
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: agentColor ? agentColor.bg : `${iconColor}20` }}
            >
              <AgentIcon className="h-3 w-3" style={{ color: iconColor }} />
            </div>
            <span>{displayName}</span>
            {isAgent && (
              <span
                className="text-[10px] px-1.5 py-0 rounded"
                style={{ background: agentColor!.bg, border: `1px solid ${agentColor!.border}`, color: agentColor!.text }}
              >
                agent
              </span>
            )}
            {msg.thinkingContent && <Brain className="h-3 w-3" style={{ color: '#A78BFA' }} aria-label="Contains reasoning" />}
          </div>
          <span className="text-[11px] text-muted-foreground/70">{formatRelativeTime(msg.timestamp.toISOString())}</span>
        </div>
        <div className="max-w-[82%] min-w-0 w-full">
          {msg.thinkingContent && <ThinkingPanel content={msg.thinkingContent} />}
          <div
            className="min-w-0 overflow-hidden rounded-2xl rounded-tl-md px-4 py-3 text-sm mt-1"
            style={{
              background: agentColor ? agentColor.bg : BUBBLE_COLORS.assistant.bg,
              border: `1px solid ${agentColor ? agentColor.border : BUBBLE_COLORS.assistant.border}`,
              ...(isAgent ? { borderLeft: `3px solid ${agentColor!.text}` } : {}),
            }}
          >
            {msg.isStreaming && !msg.content
              ? <span className="text-muted-foreground animate-pulse text-xs">Thinking…</span>
              : <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-pre:my-2 prose-headings:my-2 prose-pre:overflow-x-auto prose-code:break-words">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
            }
          </div>
        </div>
        {(msg.inputTokens || msg.outputTokens || msg.totalTokens) && (
          <div className="flex items-center gap-2.5 px-1 text-[10px] text-muted-foreground/50">
            <span className="flex items-center gap-0.5"><Coins className="h-2.5 w-2.5" />{formatTokens(msg.totalTokens ?? (msg.inputTokens ?? 0) + (msg.outputTokens ?? 0))}</span>
            {msg.inputTokens != null && <span>↑{formatTokens(msg.inputTokens)} in</span>}
            {msg.outputTokens != null && <span>↓{formatTokens(msg.outputTokens)} out</span>}
            {msg.cacheReadTokens != null && msg.cacheReadTokens > 0 && <span>{formatTokens(msg.cacheReadTokens)} cached</span>}
            {(msg.inputTokens != null || msg.outputTokens != null) && (
              <span className="ml-auto font-mono" style={{ color: 'rgba(52,211,153,0.70)' }}>
                {formatCost(calcCost(msg.inputTokens ?? 0, msg.outputTokens ?? 0, msg.cacheCreationTokens ?? 0, msg.cacheReadTokens ?? 0, msg.model))}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (msg.role === 'tool') return <div className="my-2 px-4"><div className="max-w-[88%]"><ChatToolCard msg={msg} /></div></div>;

  if (msg.role === 'permission_denial') return <div className="my-2 px-4"><PermissionDenialCard msg={msg} onRetry={onRetry} /></div>;

  if (msg.role === 'permission_change') {
    const mode = msg.permissionMode ?? msg.content;
    const modeColor = mode === 'dangerouslySkipPermissions' ? '#EF4444' : mode === 'acceptEdits' ? '#F59E0B' : '#60A5FA';
    const modeLabel = mode === 'dangerouslySkipPermissions' ? 'Allow All (Dangerous)' : mode === 'acceptEdits' ? 'Allow File Edits' : mode ?? 'Default';
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5"
          style={{ background: `${modeColor}18`, border: `1px solid ${modeColor}40`, color: modeColor }}>
          <Shield className="h-3 w-3" />
          <span>Permission mode → {modeLabel}</span>
        </div>
      </div>
    );
  }

  if (msg.role === 'api_error') return <ApiErrorCard content={msg.content} />;

  if (msg.role === 'compact_boundary') {
    let tokensFreed: string | null = null;
    if (msg.content) {
      try {
        const meta = JSON.parse(msg.content) as { preTokens?: number; postTokens?: number };
        if (meta.preTokens != null && meta.postTokens != null) {
          tokensFreed = formatTokens(meta.preTokens - meta.postTokens);
        }
      } catch { /* old records have no JSON content */ }
    }
    return (
      <div className="flex items-center gap-3 my-4 px-4">
        <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.20)' }} />
        <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'rgba(139,92,246,0.60)' }}>
          conversation compacted{tokensFreed ? ` · ${tokensFreed} tokens freed` : ''} · {formatRelativeTime(msg.timestamp.toISOString())}
        </span>
        <div className="flex-1 h-px" style={{ background: 'rgba(139,92,246,0.20)' }} />
      </div>
    );
  }

  if (msg.role === 'system') {
    const isPermission = msg.notificationType === 'permission_prompt';
    const isIdle       = msg.notificationType === 'idle_prompt';
    const color = msg.isError ? '#EF4444' : isPermission ? '#F59E0B' : isIdle ? '#818CF8' : ROLE_COLORS.system;
    const bg    = msg.isError ? 'rgba(239,68,68,0.10)' : isPermission ? 'rgba(245,158,11,0.10)' : isIdle ? 'rgba(129,140,248,0.10)' : BUBBLE_COLORS.system.bg;
    const border = msg.isError ? 'rgba(239,68,68,0.30)' : isPermission ? 'rgba(245,158,11,0.30)' : isIdle ? 'rgba(129,140,248,0.30)' : BUBBLE_COLORS.system.border;
    const Icon = msg.isError ? AlertTriangle : isPermission ? Lock : isIdle ? PauseCircle : BellRing;
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5"
          style={{ background: bg, border: `1px solid ${border}`, color }}>
          <Icon className="h-3 w-3" />
          <span>{msg.content}</span>
        </div>
      </div>
    );
  }
  return null;
});

// ─── Markdown preview ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mdComponents: Record<string, (props: any) => React.ReactElement | null> = {
  code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode; [k: string]: unknown }) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div"
        customStyle={{ margin: '0.75rem 0', borderRadius: '0.375rem', fontSize: '0.8rem' }} {...props}>
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className="px-1.5 py-0.5 rounded text-[0.8em] font-mono" style={{ background: 'rgba(255,255,255,0.08)', color: '#ce9178' }}>
        {children}
      </code>
    );
  },
  table: ({ children }) => <div className="overflow-x-auto my-3"><table className="min-w-full border-collapse text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border border-white/20 px-3 py-1.5 bg-white/5 text-left text-xs font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-white/10 px-3 py-1.5 text-xs">{children}</td>,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/40 pl-4 my-3" style={{ color: '#9ca3af', fontStyle: 'italic' }}>{children}</blockquote>,
  input: ({ checked }) => <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle" />,
  img: ({ src, alt }) => <img src={src} alt={alt || ''} className="max-w-full rounded my-2" />,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
};

function MdContent({ content }: { content: string }) {
  return (
    <div className="px-8 py-6 h-full overflow-auto" style={{ background: '#1e1e1e', color: '#d4d4d4' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', fontFamily: "'Segoe WPC', 'Segoe UI', sans-serif", fontSize: 14, lineHeight: 1.7 }}>
        <style>{`
          .md-body h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid #3e3e3e; padding-bottom: .3em; margin: 1em 0 .5em; }
          .md-body h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid #3e3e3e; padding-bottom: .3em; margin: 1em 0 .5em; }
          .md-body h3 { font-size: 1.25em; font-weight: 600; margin: .8em 0 .4em; }
          .md-body h4,h5,h6 { font-weight: 600; margin: .6em 0 .3em; }
          .md-body p { margin: .5em 0; }
          .md-body ul { list-style: disc; padding-left: 1.5em; margin: .4em 0; }
          .md-body ol { list-style: decimal; padding-left: 1.5em; margin: .4em 0; }
          .md-body li { margin: .2em 0; }
          .md-body hr { border: none; border-top: 1px solid #3e3e3e; margin: 1.5em 0; }
          .md-body pre { background: #2d2d2d; border-radius: 4px; margin: .75em 0; overflow: auto; }
          .md-body img { max-width: 100%; }
        `}</style>
        <div className="md-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  'Review this codebase and summarize what it does',
  'Find any security issues in the code',
  'Explain the architecture and main components',
  'Fix any failing tests',
];

// ─── Main component ────────────────────────────────────────────────────────────

export function ChatClient({
  initialSessions,
  initialSessionId,
}: {
  initialSessions: Session[];
  initialSessionId?: string;
}) {
  const router = useRouter();

  // Sessions (used only for project picker recent list)
  const [sessions] = useState<Session[]>(initialSessions);

  // File tree
  const [treeEntries, setTreeEntries] = useState<TreeEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [treeChildrenMap, setTreeChildrenMap] = useState<Map<string, TreeEntry[]>>(new Map());
  const [treeLoading, setTreeLoading] = useState(false);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [mdPreview, setMdPreview] = useState<'edit' | 'preview' | 'split'>('edit');
  const [filePanelPct, setFilePanelPct] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Inline tree editing
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemIsDir, setNewItemIsDir] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: TreeEntry } | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sessionCost, setSessionCost] = useState(0);
  const [copied, setCopied] = useState(false);

  // Project picker
  const [showProjectPicker, setShowProjectPicker] = useState(!initialSessionId);

  // Directory browser modal
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState('');
  const [browserDirs, setBrowserDirs] = useState<string[]>([]);
  const [browserParent, setBrowserParent] = useState<string | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [selectedDirectory, setSelectedDirectory] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customDir, setCustomDir] = useState('');
  const [permissionMode, setPermissionMode] = useState<'default' | 'acceptEdits' | 'dangerouslySkipPermissions'>('default');
  const [selectedModel, setSelectedModel] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [directories, setDirectories] = useState<DirectoriesResponse | null>(null);

  // Input attachments
  const [attachedImages, setAttachedImages] = useState<Array<{ dataUrl: string; mimeType: string }>>([]);
  const [mentionedFiles, setMentionedFiles] = useState<Array<{ path: string; relPath: string }>>([]);

  // Command palette (/ commands)
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdSelectedIdx, setCmdSelectedIdx] = useState(0);
  const [dynamicCmds, setDynamicCmds] = useState<SlashCommand[]>([]);

  // File mention picker (@ references)
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState('');
  const [filePickerFiles, setFilePickerFiles] = useState<string[]>([]);
  const [filePickerDirs, setFilePickerDirs] = useState<string[]>([]);
  const [filePickerIdx, setFilePickerIdx] = useState(0);

  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const oldestEventIdRef = useRef<number | null>(null);
  const isPrependingRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const atPositionRef = useRef<number | null>(null);
  const fileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserMsgRef = useRef<{ text: string; imgs: Array<{ dataUrl: string; mimeType: string }>; files: Array<{ path: string; relPath: string }> } | null>(null);

  const effectiveDir = showCustomInput ? customDir : selectedDirectory;
  const activeSession = sessions.find(s => s.session_id === currentSessionId);

  // Fetch directories on mount
  useEffect(() => {
    fetch('/api/chat/directories').then(r => r.json()).then(setDirectories).catch(() => {});
  }, []);

  // Dismiss context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // Load file tree when project directory changes
  const loadTreeDir = useCallback(async (path: string): Promise<TreeEntry[]> => {
    const res = await fetch(`/api/chat/filetree?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    return (data.entries as TreeEntry[]) || [];
  }, []);

  useEffect(() => {
    if (!effectiveDir) { setTreeEntries([]); return; }
    setTreeLoading(true);
    setExpandedDirs(new Set());
    setTreeChildrenMap(new Map());
    setOpenFile(null);
    loadTreeDir(effectiveDir).then(entries => { setTreeEntries(entries); setTreeLoading(false); }).catch(() => setTreeLoading(false));
  }, [effectiveDir, loadTreeDir]);

  const toggleDir = useCallback(async (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); return next; }
      next.add(path);
      return next;
    });
    setTreeChildrenMap(prev => {
      if (prev.has(path)) return prev; // already cached — don't reload
      return prev;
    });
    // Load children if not cached
    setTreeChildrenMap(prev => {
      if (prev.has(path)) return prev;
      loadTreeDir(path).then(entries => {
        setTreeChildrenMap(m => new Map(m).set(path, entries));
      });
      return new Map(prev).set(path, []); // placeholder while loading
    });
  }, [loadTreeDir]);

  const openFileContent = useCallback(async (path: string) => {
    setFileLoading(true);
    try {
      const res = await fetch(`/api/chat/filecontent?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      const file = { path, name: path.split('/').pop() || path, ...data } as OpenFile;
      setOpenFile(file);
      setEditedContent(data.content || '');
      setMdPreview('edit');
    } catch { /* silent */ } finally {
      setFileLoading(false);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!openFile || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/chat/filecontent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: openFile.path, content: editedContent }),
      });
      const data = await res.json();
      if (data.ok) {
        setOpenFile(prev => prev ? { ...prev, content: editedContent, size: data.size, lines: data.lines } : prev);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  }, [openFile, editedContent, saving]);

  // Load initial session from URL
  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After prepending older messages, restore scroll so the previously-visible content stays in place.
  // useLayoutEffect fires before useEffect for the same dependency — so we restore position here
  // but do NOT reset isPrependingRef yet (useEffect reads it next).
  useLayoutEffect(() => {
    if (isPrependingRef.current && threadScrollRef.current && prevScrollHeightRef.current) {
      threadScrollRef.current.scrollTop =
        threadScrollRef.current.scrollHeight - prevScrollHeightRef.current + prevScrollTopRef.current;
      prevScrollHeightRef.current = 0;
      prevScrollTopRef.current = 0;
    }
  }, [messages]);

  // Scroll to bottom on new messages — skip when we're prepending older ones.
  // Always resets isPrependingRef so the flag is cleared after both effects run.
  useEffect(() => {
    if (!isPrependingRef.current) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    isPrependingRef.current = false;
  }, [messages]);

  // Instant scroll to bottom when a session finishes loading (messages are now rendered).
  // Can't rely on the messages effect above because loadingSession=true hides the thread
  // while messages are being set, so threadEndRef isn't in the DOM at that point.
  useEffect(() => {
    if (!loadingSession && threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [loadingSession]);

  const loadSession = async (sessionId: string) => {
    abortRef.current?.abort();
    setMessages([]);
    setCurrentSessionId(sessionId);
    setSessionCost(0);
    setIsStreaming(false);
    setShowProjectPicker(false);
    setLoadingSession(true);
    setMobileExplorerOpen(false);

    // Sync URL
    router.push(`/chat/${sessionId}`, { scroll: false });

    oldestEventIdRef.current = null;
    setHasMoreEvents(false);

    try {
      const [evRes, trRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/events?limit=50`),
        fetch(`/api/sessions/${sessionId}/transcript?types=thinking,image,document,rejection,permission-mode,api_error,compact_boundary`).catch(() => null),
      ]);
      const data = await evRes.json();
      const events: Event[] = Array.isArray(data) ? data : (data.events ?? []);
      const trData = trRes ? await trRes.json().catch(() => ({ records: [] })) : { records: [] };
      const transcriptRecords: TranscriptRecord[] = trData.records ?? [];

      setMessages(mergeTranscriptIntoMessages(eventsToMessages(events), events, transcriptRecords));
      setHasMoreEvents(data.has_more ?? false);
      if (events.length > 0) oldestEventIdRef.current = events[0].id;

      const session = sessions.find(s => s.session_id === sessionId);
      if (session?.cwd) setSelectedDirectory(session.cwd);
    } catch { /* silent */ } finally {
      setLoadingSession(false);
    }
  };

  const loadMoreEvents = useCallback(async () => {
    if (!currentSessionId || !hasMoreEvents || loadingMore || oldestEventIdRef.current === null) return;
    // Capture BEFORE any state change — spinner appearing outside the container
    // doesn't affect scrollHeight, but capturing here avoids all timing ambiguity
    isPrependingRef.current = true;
    prevScrollHeightRef.current = threadScrollRef.current?.scrollHeight ?? 0;
    prevScrollTopRef.current   = threadScrollRef.current?.scrollTop   ?? 0;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}/events?limit=50&before_id=${oldestEventIdRef.current}`);
      const data = await res.json();
      const older: Event[] = data.events ?? [];
      if (older.length > 0) {
        oldestEventIdRef.current = older[0].id;
        setMessages(prev => {
          const olderMsgs = eventsToMessages(older);
          // Fix cross-boundary pairing: a PreToolUse at the end of this older batch
          // may have its PostToolUse already loaded as a tool card in prev.
          // Match by tool name within a 60s window and upgrade to a proper tool card.
          const fixed = olderMsgs.map(m => {
            if (m.role !== 'permission_denial' || !m.toolName) return m;
            const match = prev.find(p =>
              p.role === 'tool' &&
              p.toolName === m.toolName &&
              p.timestamp.getTime() > m.timestamp.getTime() &&
              p.timestamp.getTime() - m.timestamp.getTime() < 60000
            );
            if (match) return { ...m, role: 'tool' as const, toolOutput: match.toolOutput, toolIsError: match.toolIsError };
            return m;
          });
          return [...fixed, ...prev];
        });
      } else {
        isPrependingRef.current = false;
      }
      setHasMoreEvents(data.has_more ?? false);
    } catch { isPrependingRef.current = false; } finally {
      setLoadingMore(false);
    }
  }, [currentSessionId, hasMoreEvents, loadingMore]);

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setCurrentSessionId(null);
    setSessionCost(0);
    setIsStreaming(false);
    setShowProjectPicker(true);
    router.push('/chat', { scroll: false });
  };

  const selectProject = (path: string) => {
    setSelectedDirectory(path);
    setShowCustomInput(false);
    setShowProjectPicker(false);
  };

  const navigateBrowser = async (path: string) => {
    setBrowserLoading(true);
    try {
      const url = path ? `/api/chat/browse?path=${encodeURIComponent(path)}` : '/api/chat/browse';
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) return;
      setBrowserPath(data.path);
      setBrowserDirs(data.dirs);
      setBrowserParent(data.parent);
    } catch { /* silent */ } finally {
      setBrowserLoading(false);
    }
  };

  const openDirBrowser = async () => {
    setShowDirBrowser(true);
    await navigateBrowser(selectedDirectory || '');
  };

  const confirmBrowserSelection = () => {
    if (!browserPath) return;
    setSelectedDirectory(browserPath);
    setShowCustomInput(false);
    setShowDirBrowser(false);
    setShowProjectPicker(false);
  };

  const joinPath = (base: string, name: string) =>
    base.endsWith('/') ? base + name : base + '/' + name;

  const cancelEdit = useCallback(() => {
    setCreatingIn(null); setNewItemName('');
    setRenamingPath(null); setRenameValue('');
  }, []);

  const reloadDir = useCallback(async (dir: string) => {
    const entries = await loadTreeDir(dir);
    if (dir === effectiveDir) setTreeEntries(entries);
    else setTreeChildrenMap(m => new Map(m).set(dir, entries));
  }, [effectiveDir, loadTreeDir]);

  const reloadTree = useCallback(async () => {
    if (!effectiveDir) return;
    setTreeLoading(true);
    setTreeChildrenMap(new Map());
    setExpandedDirs(new Set());
    try {
      const entries = await loadTreeDir(effectiveDir);
      setTreeEntries(entries);
    } catch { /* silent */ } finally {
      setTreeLoading(false);
    }
  }, [effectiveDir, loadTreeDir]);

  const startCreate = useCallback((folderPath: string, isDir: boolean) => {
    setExpandedDirs(prev => new Set([...prev, folderPath]));
    if (!treeChildrenMap.has(folderPath) && folderPath !== effectiveDir) {
      loadTreeDir(folderPath).then(e => setTreeChildrenMap(m => new Map(m).set(folderPath, e)));
    }
    setCreatingIn(folderPath); setNewItemName(''); setNewItemIsDir(isDir);
    setRenamingPath(null);
  }, [treeChildrenMap, effectiveDir, loadTreeDir]);

  const createItem = useCallback(async () => {
    const name = newItemName.trim();
    if (!creatingIn || !name) { cancelEdit(); return; }
    const targetPath = joinPath(creatingIn, name);
    try {
      const res = await fetch('/api/chat/fileops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', path: targetPath, isDir: newItemIsDir }),
      });
      if (res.ok) {
        await reloadDir(creatingIn);
        if (!newItemIsDir) openFileContent(targetPath);
      }
    } catch { /* silent */ }
    cancelEdit();
  }, [creatingIn, newItemName, newItemIsDir, openFileContent, reloadDir, cancelEdit]);

  const startRename = useCallback((path: string, currentName: string) => {
    setRenamingPath(path); setRenameValue(currentName); setCreatingIn(null);
  }, []);

  const renameItem = useCallback(async () => {
    const name = renameValue.trim();
    if (!renamingPath || !name) { cancelEdit(); return; }
    const parts = renamingPath.split('/');
    parts[parts.length - 1] = name;
    const newPath = parts.join('/');
    if (newPath === renamingPath) { cancelEdit(); return; }
    const parentDir = parts.slice(0, -1).join('/');
    try {
      const res = await fetch('/api/chat/fileops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', oldPath: renamingPath, newPath }),
      });
      if (res.ok) {
        await reloadDir(parentDir);
        if (openFile?.path === renamingPath) {
          setOpenFile(prev => prev ? { ...prev, path: newPath, name } : prev);
        }
      }
    } catch { /* silent */ }
    cancelEdit();
  }, [renamingPath, renameValue, openFile, reloadDir, cancelEdit]);

  const copySessionId = () => {
    if (!currentSessionId) return;
    navigator.clipboard.writeText(currentSessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Slash command execution ───────────────────────────────────────────────

  const executeSlashCommand = useCallback((name: string) => {
    setShowCmdPalette(false);
    setPrompt('');
    switch (name) {
      case 'clear':
        setMessages([]);
        setCurrentSessionId(null);
        router.push('/chat', { scroll: false });
        break;
      case 'help':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: 'system' as const,
          content: 'Commands: /clear /compact /cost /help /init /memory /model /review  |  Type @ to reference a file  |  Paste or drag images to attach them',
          timestamp: new Date(),
        }]);
        break;
      case 'cost':
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: 'system' as const,
          content: `Session cost: ${formatCost(sessionCost)}`,
          timestamp: new Date(),
        }]);
        break;
      case 'model':
        setShowSettings(true);
        break;
      default:
        sendMessageCore(`/${name}`, [], []);
    }
  }, [router, sessionCost]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── @ file mention ────────────────────────────────────────────────────────

  const selectFileMention = useCallback((relPath: string) => {
    setShowFilePicker(false);
    setFilePickerDirs([]);
    if (atPositionRef.current !== null && textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      const before = prompt.slice(0, atPositionRef.current);
      const after = prompt.slice(cursor);
      // Keep @relPath inline in the message (trailing space so picker won't re-trigger)
      const newPrompt = before + '@' + relPath + ' ' + after;
      setPrompt(newPrompt);
      const newCursor = before.length + 1 + relPath.length + 1;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    }
    atPositionRef.current = null;
    const fullPath = effectiveDir ? `${effectiveDir}/${relPath}` : relPath;
    setMentionedFiles(prev => prev.find(f => f.path === fullPath) ? prev : [...prev, { path: fullPath, relPath }]);
  }, [prompt, effectiveDir]);

  // Drill into a directory — keeps picker open and re-searches within it
  const selectDirMention = useCallback((dirPath: string) => {
    const newQuery = dirPath + '/';
    if (atPositionRef.current !== null && textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      const before = prompt.slice(0, atPositionRef.current);
      const after = prompt.slice(cursor);
      const newPrompt = before + '@' + newQuery + after;
      setPrompt(newPrompt);
      const newCursor = before.length + 1 + newQuery.length;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    }
    setFilePickerQuery(newQuery);
    setFilePickerIdx(0);
    if (effectiveDir) {
      fetch(`/api/chat/filesearch?cwd=${encodeURIComponent(effectiveDir)}&q=${encodeURIComponent(newQuery)}`)
        .then(r => r.json())
        .then(d => { setFilePickerFiles(d.files || []); setFilePickerDirs(d.dirs || []); setFilePickerIdx(0); })
        .catch(() => {});
    }
  }, [prompt, effectiveDir]);

  // ─── Image attachment ──────────────────────────────────────────────────────

  const addImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setAttachedImages(prev => prev.length >= 4 ? prev : [...prev, { dataUrl, mimeType: file.type }]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) addImageFile(file);
  }, [addImageFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.slice(0, 4 - attachedImages.length).forEach(addImageFile);
  }, [attachedImages.length, addImageFile]);

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m));
  };

  // Core send — separated so slash commands can call without touching attachment state
  const sendMessageCore = async (
    text: string,
    imgs: Array<{ dataUrl: string; mimeType: string }>,
    files: Array<{ path: string; relPath: string }>,
    permissionModeOverride?: 'default' | 'acceptEdits' | 'dangerouslySkipPermissions',
  ) => {
    const dir = effectiveDir;
    if (!text.trim() || !dir || isStreaming) return;
    lastUserMsgRef.current = { text, imgs, files };

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsStreaming(true);

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date(),
      attachedImages: imgs.map(i => i.dataUrl),
      mentionedFiles: files.map(f => f.relPath),
    }]);

    const abort = new AbortController();
    abortRef.current = abort;
    const pendingTools = new Map<string, string>();

    try {
      // Prepare image data for stream-json stdin (base64 passed directly)
      const imagePayload = imgs.map(img => ({ data: img.dataUrl, mimeType: img.mimeType }));

      // Replace inline @relPath tokens with file content at their position
      let fullPrompt = text;
      for (const f of files) {
        const token = '@' + f.relPath;
        if (!fullPrompt.includes(token)) continue;
        try {
          const r = await fetch(`/api/chat/filecontent?path=${encodeURIComponent(f.path)}`);
          const d = await r.json();
          if (d.content) {
            fullPrompt = fullPrompt.replace(token, `<file path="${f.relPath}">\n${d.content}\n</file>`);
          }
        } catch { /* skip */ }
      }

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          prompt: fullPrompt,
          sessionId: currentSessionId || undefined,
          cwd: dir,
          permissionMode: permissionModeOverride ?? permissionMode,
          model: selectedModel || undefined,
          maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
          images: imagePayload.length ? imagePayload : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as Record<string, unknown>;

            if (event.type === 'system') {
              const ev = event as { subtype?: string; session_id?: string; slash_commands?: string[] };
              if (ev.subtype === 'init') {
                if (ev.session_id) {
                  setCurrentSessionId(ev.session_id);
                  router.push(`/chat/${ev.session_id}`, { scroll: false });
                }
                if (ev.slash_commands?.length) {
                  const knownNames = new Set(SLASH_COMMANDS.map(c => c.name));
                  setDynamicCmds(
                    ev.slash_commands
                      .filter(name => !knownNames.has(name))
                      .map(name => ({ name, desc: '', local: false }))
                  );
                }
              }
              continue;
            }

            if (event.type === 'assistant') {
              type ContentBlock =
                | { type: 'text'; text: string }
                | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
              const content: ContentBlock[] = (event.message as { content?: ContentBlock[] })?.content ?? [];
              const textBlocks = content.filter((b): b is { type: 'text'; text: string } => b.type === 'text' && !!b.text);
              const toolBlocks = content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use');

              if (textBlocks.length > 0) {
                setMessages(prev => [...prev, {
                  id: crypto.randomUUID(), role: 'assistant',
                  content: textBlocks.map(b => b.text).join(''),
                  timestamp: new Date(),
                }]);
              }
              for (const block of toolBlocks) {
                const toolMsgId = crypto.randomUUID();
                if (block.id) pendingTools.set(block.id, toolMsgId);
                setMessages(prev => [...prev, {
                  id: toolMsgId, role: 'tool', content: '',
                  toolName: block.name, toolInput: block.input,
                  toolOutput: null, isStreaming: true, timestamp: new Date(),
                }]);
              }
              continue;
            }

            if (event.type === 'user') {
              type ToolResult = { type: 'tool_result'; tool_use_id?: string; content?: unknown; is_error?: boolean };
              const content: ToolResult[] = (event.message as { content?: ToolResult[] })?.content ?? [];
              for (const result of content.filter(b => b.type === 'tool_result')) {
                if (!result.tool_use_id) continue;
                const toolMsgId = pendingTools.get(result.tool_use_id);
                if (!toolMsgId) continue;
                let output: string | null = null;
                if (Array.isArray(result.content)) output = (result.content as Array<{ text?: string }>).map(b => b.text || '').join('\n') || null;
                else if (typeof result.content === 'string') output = result.content;
                setMessages(prev => prev.map(m => m.id === toolMsgId ? { ...m, toolOutput: output, isStreaming: false, toolIsError: result.is_error ?? false } : m));
                pendingTools.delete(result.tool_use_id);
              }
              continue;
            }

            if (event.type === 'result') {
              const ev = event as {
                total_cost_usd?: number;
                usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
                permission_denials?: Array<{ tool_name: string; tool_input: Record<string, unknown> }>;
              };
              if (ev.total_cost_usd) setSessionCost(prev => prev + ev.total_cost_usd!);
              if (ev.usage) {
                const { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } = ev.usage;
                setMessages(prev => {
                  const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === 'assistant');
                  if (lastAssistantIdx === -1) return prev;
                  const idx = prev.length - 1 - lastAssistantIdx;
                  return prev.map((m, i) => i !== idx ? m : {
                    ...m,
                    inputTokens: input_tokens,
                    outputTokens: output_tokens,
                    cacheCreationTokens: cache_creation_input_tokens,
                    cacheReadTokens: cache_read_input_tokens,
                    totalTokens: (input_tokens ?? 0) + (output_tokens ?? 0),
                  });
                });
              }
              for (const denial of ev.permission_denials ?? []) {
                setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'permission_denial', content: `Permission denied: ${denial.tool_name}`, timestamp: new Date(), permissionDenial: denial }]);
              }
              continue;
            }

            if (event.type === 'error') {
              const message = String((event as { message?: unknown }).message || 'Unknown error');
              let display = `Error: ${message}`;
              if (message.includes('ENOENT') || message.toLowerCase().includes('not found')) display = 'Claude Code not installed. Run: npm i -g @anthropic-ai/claude-code';
              else if (message.toLowerCase().includes('auth')) display = 'Not authenticated. Run `claude auth login` in your terminal first.';
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: display, timestamp: new Date(), isError: true }]);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: new Date(), isError: true }]);
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m));
    }
  };

  // Public sendMessage — captures current attachment state then delegates
  const sendMessage = (text: string) => {
    const imgs = [...attachedImages];
    const files = [...mentionedFiles];
    setPrompt('');
    setAttachedImages([]);
    setMentionedFiles([]);
    setShowCmdPalette(false);
    setShowFilePicker(false);
    setFilePickerDirs([]);
    sendMessageCore(text, imgs, files);
  };

  // Retry last user message with a different permission mode
  const retryWithPermission = useCallback((mode: RetryMode) => {
    const last = lastUserMsgRef.current;
    if (!last || isStreaming) return;
    sendMessageCore(last.text, last.imgs, last.files, mode);
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const allCmds = [...SLASH_COMMANDS, ...dynamicCmds];
  const filteredCmds = allCmds.filter(c => c.name.startsWith(cmdQuery));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Command palette navigation
    if (showCmdPalette && filteredCmds.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCmdSelectedIdx(i => Math.min(i + 1, filteredCmds.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCmdSelectedIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter')     { e.preventDefault(); executeSlashCommand(filteredCmds[cmdSelectedIdx].name); return; }
      if (e.key === 'Escape')    { setShowCmdPalette(false); setPrompt(''); return; }
    }
    // File picker navigation (dirs first, then files in combined index)
    if (showFilePicker && (filePickerDirs.length > 0 || filePickerFiles.length > 0)) {
      const total = filePickerDirs.length + filePickerFiles.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); setFilePickerIdx(i => Math.min(i + 1, total - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setFilePickerIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filePickerIdx < filePickerDirs.length) selectDirMention(filePickerDirs[filePickerIdx]);
        else selectFileMention(filePickerFiles[filePickerIdx - filePickerDirs.length]);
        return;
      }
      if (e.key === 'Escape') { setShowFilePicker(false); setFilePickerDirs([]); atPositionRef.current = null; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && prompt.trim() && effectiveDir) sendMessage(prompt);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;

    // Slash command palette: triggers on /word at start of input
    if (val.startsWith('/') && !val.slice(1).includes(' ') && !val.slice(1).includes('\n')) {
      setCmdQuery(val.slice(1));
      setShowCmdPalette(true);
      setCmdSelectedIdx(0);
    } else {
      setShowCmdPalette(false);
    }

    // @ file mention: triggers after space or at start
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx !== -1 && (atIdx === 0 || /[\s]/.test(before[atIdx - 1]))) {
      const query = before.slice(atIdx + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        atPositionRef.current = atIdx;
        setFilePickerQuery(query);
        setShowFilePicker(true);
        setFilePickerIdx(0);
        if (effectiveDir) {
          if (fileSearchTimerRef.current) clearTimeout(fileSearchTimerRef.current);
          fileSearchTimerRef.current = setTimeout(() => {
            fetch(`/api/chat/filesearch?cwd=${encodeURIComponent(effectiveDir)}&q=${encodeURIComponent(query)}`)
              .then(r => r.json())
              .then(d => { setFilePickerFiles(d.files || []); setFilePickerDirs(d.dirs || []); })
              .catch(() => {});
          }, 150);
        }
        return;
      }
    }
    setShowFilePicker(false);
    setFilePickerDirs([]);
    atPositionRef.current = null;
  };

  // Build directory options
  const dirOptions: DirectoryOption[] = [];
  if (directories) {
    for (const p of directories.recentProjects) {
      if (!dirOptions.find(d => d.path === p.project_dir)) dirOptions.push({ path: p.project_dir, name: p.project_name });
    }
    for (const d of directories.availableDirectories) {
      if (!dirOptions.find(o => o.path === d.path)) dirOptions.push(d);
    }
  }

  // Unique projects for the picker (from session history)
  const allProjects: Array<{ name: string; path: string; lastActive: string }> = [];
  for (const s of sessions) {
    if (!allProjects.find(p => p.name === (s.project_name || 'Unknown'))) {
      allProjects.push({ name: s.project_name || 'Unknown', path: s.project_dir || s.cwd || '', lastActive: s.last_seen_at });
    }
  }

  const handleResizeDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
      setFilePanelPct(pct);
    };
    const onUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const openContextMenu = useCallback((e: React.MouseEvent, entry: TreeEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setContextMenu({ x, y, entry });
  }, []);

  const renderTree = (entries: TreeEntry[], level: number): React.ReactNode => (
    <>
      {entries.map(entry => {
        const pad = level * 12 + 8;
        const isRenaming = renamingPath === entry.path;

        if (entry.type === 'file') {
          const isActive = openFile?.path === entry.path;
          return (
            <button key={entry.path} style={{ paddingLeft: pad }}
              onClick={() => openFileContent(entry.path)}
              onContextMenu={e => openContextMenu(e, entry)}
              className={`w-full flex items-center gap-2 py-[3px] pr-3 text-[12px] rounded-sm transition-colors ${isActive ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
              <FileIcon name={entry.name} />
              {isRenaming ? (
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameItem(); if (e.key === 'Escape') cancelEdit(); }}
                  onBlur={renameItem}
                  className="flex-1 min-w-0 bg-muted/40 border border-primary/50 rounded px-1 py-0 text-[11px] font-mono outline-none"
                  onClick={e => e.stopPropagation()} />
              ) : (
                <span className="truncate">{entry.name}</span>
              )}
            </button>
          );
        }

        const isOpen = expandedDirs.has(entry.path);
        const children = treeChildrenMap.get(entry.path) || [];
        const showCreate = creatingIn === entry.path;
        return (
          <div key={entry.path}>
            <button style={{ paddingLeft: pad }}
              onClick={() => toggleDir(entry.path)}
              onContextMenu={e => openContextMenu(e, entry)}
              className="w-full flex items-center gap-1.5 py-[3px] pr-3 text-[12px] text-foreground/75 hover:text-foreground hover:bg-white/5 rounded-sm transition-colors">
              {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <Folder className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />}
              {isRenaming ? (
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameItem(); if (e.key === 'Escape') cancelEdit(); }}
                  onBlur={renameItem}
                  className="flex-1 min-w-0 bg-muted/40 border border-primary/50 rounded px-1 py-0 text-[11px] font-mono outline-none"
                  onClick={e => e.stopPropagation()} />
              ) : (
                <span className="truncate font-medium">{entry.name}</span>
              )}
            </button>
            {isOpen && (
              <div>
                {showCreate && (
                  <div style={{ paddingLeft: (level + 1) * 12 + 8 }} className="flex items-center gap-2 py-[3px] pr-2">
                    {newItemIsDir ? <Folder className="h-3.5 w-3.5 text-amber-400/70 shrink-0" /> : <File className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                    <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createItem(); if (e.key === 'Escape') cancelEdit(); }}
                      onBlur={createItem}
                      placeholder={newItemIsDir ? 'folder-name' : 'filename.ts'}
                      className="flex-1 min-w-0 bg-muted/40 border border-primary/50 rounded px-1.5 py-0.5 text-[11px] font-mono outline-none" />
                  </div>
                )}
                {renderTree(children, level + 1)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <>
    <div className="flex h-full relative">
      {/* Mobile explorer backdrop */}
      {mobileExplorerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileExplorerOpen(false)}
        />
      )}

      {/* ── Left panel: VS Code-style file explorer ── */}
      <aside className={[
        'shrink-0 border-r border-border/60 flex flex-col bg-card/30 select-none',
        // Mobile: fixed overlay
        'fixed inset-y-0 left-0 z-40 md:relative md:inset-auto md:z-auto',
        'transition-transform duration-300',
        mobileExplorerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        'w-[240px]',
      ].join(' ')}>
        {/* Header: project name + actions */}
        <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-2 min-w-0">
          <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate flex-1 min-w-0">
            {effectiveDir ? effectiveDir.split('/').pop() : 'Explorer'}
          </span>
          {effectiveDir && (
            <>
              <button onClick={() => startCreate(effectiveDir, false)} title="New file"
                className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => startCreate(effectiveDir, true)} title="New folder"
                className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button onClick={reloadTree} title="Reload explorer" disabled={treeLoading}
                className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${treeLoading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          <button onClick={newChat} title="Change project"
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowSettings(v => !v)} title="Settings"
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors shrink-0 ${showSettings ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}>
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Collapsible settings */}
        {showSettings && (
          <div className="p-3 border-b border-border/60 space-y-3 bg-muted/10">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Directory</label>
              <select value={showCustomInput ? '__custom__' : selectedDirectory}
                onChange={e => { if (e.target.value === '__custom__') { setShowCustomInput(true); } else { setShowCustomInput(false); setSelectedDirectory(e.target.value); } }}
                className="w-full text-xs rounded-lg px-2 py-1.5 bg-muted/40 border border-border focus:outline-none focus:border-primary/40">
                <option value="">Select…</option>
                {dirOptions.map(d => <option key={d.path} value={d.path} title={d.path}>{d.name}</option>)}
                <option value="__custom__">Custom…</option>
              </select>
              {showCustomInput && (
                <input type="text" value={customDir} onChange={e => setCustomDir(e.target.value)}
                  placeholder="/path/to/project"
                  className="w-full text-xs rounded-lg px-2 py-1.5 bg-muted/40 border border-border focus:outline-none focus:border-primary/40 font-mono" />
              )}
              <button onClick={openDirBrowser} className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-1 rounded transition-colors">
                Browse folders…
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Permissions</label>
              <select value={permissionMode} onChange={e => setPermissionMode(e.target.value as typeof permissionMode)}
                className="w-full text-xs rounded-lg px-2 py-1.5 bg-muted/40 border border-border focus:outline-none focus:border-primary/40">
                <option value="default">Safe</option>
                <option value="acceptEdits">Auto-edit</option>
                <option value="dangerouslySkipPermissions">Full auto ⚠</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Model</label>
                <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                  className="w-full text-xs rounded-lg px-2 py-1.5 bg-muted/40 border border-border focus:outline-none focus:border-primary/40">
                  <option value="">Default</option>
                  <option value="claude-sonnet-4-6">Sonnet</option>
                  <option value="claude-opus-4-7">Opus</option>
                  <option value="claude-haiku-4-5-20251001">Haiku</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Budget $</label>
                <input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)}
                  placeholder="∞" min="0" step="0.10"
                  className="w-full text-xs rounded-lg px-2 py-1.5 bg-muted/40 border border-border focus:outline-none focus:border-primary/40" />
              </div>
            </div>
          </div>
        )}

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {!effectiveDir ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground/50 px-4 text-center">
              <FolderOpen className="h-8 w-8 opacity-30" />
              <p className="text-[11px]">Click + to open a project</p>
            </div>
          ) : treeLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
            </div>
          ) : (
            <>
              {creatingIn === effectiveDir && (
                <div className="flex items-center gap-2 py-[3px] px-2">
                  {newItemIsDir ? <Folder className="h-3.5 w-3.5 text-amber-400/70 shrink-0" /> : <File className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                  <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createItem(); if (e.key === 'Escape') cancelEdit(); }}
                    onBlur={createItem}
                    placeholder={newItemIsDir ? 'folder-name' : 'filename.ts'}
                    className="flex-1 min-w-0 bg-muted/40 border border-primary/50 rounded px-1.5 py-0.5 text-[11px] font-mono outline-none" />
                </div>
              )}
              {treeEntries.length === 0 && !creatingIn
                ? <p className="text-[11px] text-muted-foreground/50 text-center py-6">Empty directory</p>
                : renderTree(treeEntries, 0)
              }
            </>
          )}
        </div>
      </aside>

      {/* ── File content + Chat (resizable) ── */}
      <div ref={splitContainerRef} className="flex-1 flex min-w-0 overflow-hidden">

      {/* ── File content panel (VS Code editor style) ── */}
      {openFile && (
        <div className="shrink-0 flex flex-col border-r border-border/60" style={{ width: `${filePanelPct}%`, background: 'hsl(var(--card))' }}>
          {/* Tab bar */}
          <div className="shrink-0 flex items-center border-b border-border/60 bg-muted/20" style={{ minHeight: 36 }}>
            <div className="flex items-center gap-2 px-4 py-1.5 border-r border-border/40 bg-card/60">
              <FileIcon name={openFile.name} />
              <span className="text-[12px] text-foreground/90 font-medium">{openFile.name}</span>
              {editedContent !== openFile.content && (
                <span className="w-2 h-2 rounded-full bg-amber-400 ml-0.5" title="Unsaved changes" />
              )}
              <button onClick={() => setOpenFile(null)} className="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground/50 hover:text-foreground transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="flex-1" />
            {!openFile.isBinary && !openFile.isPdf && !openFile.isImage && !openFile.tooLarge && (
              <div className="flex items-center gap-1 mr-2">
                {/* MD preview toggles */}
                {openFile.name.endsWith('.md') && (
                  <div className="flex items-center border border-border/60 rounded overflow-hidden mr-1">
                    {([['edit', <FileCode key="e" className="h-3 w-3" />, 'Edit'],
                       ['preview', <Eye key="p" className="h-3 w-3" />, 'Preview']] as const).map(([mode, icon, label]) => (
                      <button key={mode} onClick={() => setMdPreview(mode as 'edit' | 'preview')}
                        title={label}
                        className={`flex items-center justify-center px-2 py-1 transition-colors ${mdPreview === mode ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}>
                        {icon}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={saveFile}
                  disabled={saving || editedContent === openFile.content}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium transition-colors ${
                    savedFlash ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : editedContent !== openFile.content ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20'
                    : 'text-muted-foreground/30 border border-transparent'
                  } disabled:cursor-not-allowed`}
                >
                  {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {savedFlash ? 'Saved' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {/* Editor / preview area */}
          <div className="flex-1 overflow-hidden">
            {fileLoading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
              </div>
            ) : openFile.isPdf ? (
              <iframe
                src={`/api/chat/fileraw?path=${encodeURIComponent(openFile.path)}`}
                className="w-full h-full border-none"
                title={openFile.name}
              />
            ) : openFile.isImage ? (
              <div className="flex items-center justify-center h-full overflow-auto p-4"
                style={{ background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 0 0 / 20px 20px' }}>
                <img
                  src={`/api/chat/fileraw?path=${encodeURIComponent(openFile.path)}`}
                  alt={openFile.name}
                  className="max-w-full max-h-full object-contain shadow-2xl"
                />
              </div>
            ) : openFile.isBinary ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/60">
                <File className="h-10 w-10 opacity-20" />
                <p className="text-sm">Binary file · {formatBytes(openFile.size)}</p>
              </div>
            ) : openFile.tooLarge ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/60">
                <File className="h-10 w-10 opacity-20" />
                <p className="text-sm">File too large to preview · {formatBytes(openFile.size)}</p>
              </div>
            ) : mdPreview === 'preview' ? (
              <MdContent content={editedContent} />
            ) : (
              <MonacoEditor
                height="100%"
                language={getMonacoLang(openFile.name)}
                value={editedContent}
                onChange={v => setEditedContent(v ?? '')}
                theme="vs-dark"
                onMount={(editor, monaco) => {
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => saveFile(),
                  );
                }}
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
                  fontLigatures: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  wordWrap: 'off',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  insertSpaces: true,
                  renderLineHighlight: 'line',
                  folding: true,
                  bracketPairColorization: { enabled: true },
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  padding: { top: 12, bottom: 12 },
                }}
              />
            )}
          </div>

          {/* Status bar */}
          <div className="shrink-0 flex items-center gap-4 px-4 py-1 border-t border-border/40 bg-primary/5 text-[10px] text-muted-foreground/60 font-mono">
            <span>{openFile.language}</span>
            <span>{editedContent.split('\n').length} lines</span>
            <span>{formatBytes(openFile.size)}</span>
            <span className="truncate flex-1 text-right opacity-50">{openFile.path}</span>
          </div>
        </div>
      )}

      {/* ── Resize handle (only when file is open) ── */}
      {openFile && (
        <div
          onMouseDown={handleResizeDragStart}
          onDoubleClick={() => setFilePanelPct(50)}
          className="w-[5px] shrink-0 cursor-col-resize relative group flex items-center justify-center"
          style={{ background: 'transparent' }}
          title="Drag to resize · Double-click to reset"
        >
          <div className="absolute inset-y-0 w-[1px] bg-border/60 group-hover:bg-primary/50 transition-colors" />
          <div className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[0, 1, 2].map(i => <div key={i} className="w-[3px] h-[3px] rounded-full bg-primary/70" />)}
          </div>
        </div>
      )}

      {/* ── Chat panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Session header */}
        {currentSessionId && (
          <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-3 bg-card/20 shrink-0">
            {/* Mobile explorer toggle */}
            <button
              onClick={() => setMobileExplorerOpen(v => !v)}
              className="md:hidden flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
              title="Toggle explorer"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              {activeSession && <p className="text-sm font-medium truncate">{activeSession.project_name}</p>}
              <button onClick={copySessionId} title="Copy session ID" className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {truncateId(currentSessionId, 12)}
              </button>
            </div>
            <div className="flex items-center gap-3 ml-auto shrink-0 flex-wrap">
              {activeSession && (
                <>
                  {activeSession.duration_seconds > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{formatDuration(activeSession.duration_seconds)}
                    </span>
                  )}
                  {activeSession.total_tokens > 0 && (
                    <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                      <Coins className="h-3 w-3" />{formatTokens(activeSession.total_tokens)}
                    </span>
                  )}
                  {activeSession.total_tokens > 0 && (() => {
                    const totalCost = calcCost(activeSession.input_tokens, activeSession.output_tokens, activeSession.cache_creation_tokens, activeSession.cache_read_tokens, activeSession.model);
                    const exclCost  = calcCost(activeSession.input_tokens, activeSession.output_tokens, 0, 0, activeSession.model);
                    return (
                      <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground" title="Total cost / Excl. cache cost">
                        <span>{formatCost(totalCost)}</span>
                        <span className="text-border">|</span>
                        <span className="text-blue-400">{formatCost(exclCost)}</span>
                      </span>
                    );
                  })()}
                  {activeSession.models_used?.length > 0 && (
                    <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground/70 font-mono truncate max-w-[180px]" title={activeSession.models_used.join(', ')}>
                      {activeSession.models_used.map(m => m.replace('claude-', '').replace(/-\d{8}$/, '')).join(', ')}
                    </span>
                  )}
                  {activeSession.entrypoint && (
                    <span className="hidden sm:flex items-center gap-1 text-xs rounded-full px-2 py-0.5"
                      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818CF8' }}
                      title={`Entrypoint: ${activeSession.entrypoint}`}>
                      {activeSession.entrypoint === 'claude-vscode' || activeSession.entrypoint === 'vscode'
                        ? <Eye className="h-3 w-3" />
                        : <Terminal className="h-3 w-3" />}
                      <span>{activeSession.entrypoint === 'claude-vscode' || activeSession.entrypoint === 'vscode' ? 'VS Code' : activeSession.entrypoint === 'cli' ? 'CLI' : activeSession.entrypoint}</span>
                    </span>
                  )}
                  {activeSession.git_branch && (
                    <span className="hidden md:flex items-center gap-1 text-xs font-mono rounded-full px-2 py-0.5 truncate max-w-[140px]"
                      style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: '#34D399' }}
                      title={`Branch: ${activeSession.git_branch}`}>
                      <GitBranch className="h-3 w-3 shrink-0" />
                      <span className="truncate">{activeSession.git_branch}</span>
                    </span>
                  )}
                  {activeSession.error_count > 0 && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />{activeSession.error_count}
                    </span>
                  )}
                </>
              )}
              {isStreaming && <span className="flex items-center gap-1.5 text-xs text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />Running…</span>}
              {isLive(activeSession?.last_seen_at ?? '') && !isStreaming && <span className="flex items-center gap-1 text-xs text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</span>}
            </div>
          </div>
        )}

        {/* Load-more indicator — outside the scroll container so it never affects scrollHeight */}
        {loadingMore && (
          <div className="shrink-0 flex justify-center py-1.5 border-b border-border/20">
            <span className="text-[11px] text-muted-foreground animate-pulse">Loading earlier messages…</span>
          </div>
        )}

        {/* Message thread */}
        <div
          ref={threadScrollRef}
          className="flex-1 overflow-y-auto"
          style={{ overflowAnchor: 'none' }}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop < 120 && hasMoreEvents && !loadingMore) loadMoreEvents();
          }}
        >
          {loadingSession ? (
            <div className="p-6 space-y-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`flex ${i % 3 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <div className={`h-14 rounded-2xl bg-muted/40 animate-pulse ${i % 3 === 0 ? 'w-2/3' : 'w-3/4'}`} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 && showProjectPicker ? (
            /* ── Project picker ── */
            <div className="flex flex-col h-full overflow-y-auto">
              <div className="max-w-xl mx-auto w-full px-6 py-8 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <Terminal className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">New chat</h2>
                    <p className="text-xs text-muted-foreground">Select a project to work in</p>
                  </div>
                </div>

                {/* Recent projects */}
                {allProjects.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Recent projects</p>
                    <div className="space-y-2">
                      {allProjects.map(proj => (
                        <button
                          key={proj.path}
                          onClick={() => selectProject(proj.path)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-muted/60 group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                            <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{proj.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">{proj.path}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-muted-foreground">{formatRelativeTime(proj.lastActive)}</p>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary mt-0.5 ml-auto transition-colors" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Browse for folder */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Open a different folder</p>
                  <button
                    onClick={openDirBrowser}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted/60 group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                      <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-medium group-hover:text-primary transition-colors">Browse folders…</p>
                      <p className="text-[11px] text-muted-foreground">Open the folder picker to navigate your filesystem</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* ── Ready to chat (directory already set) ── */
            <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center mx-auto">
                  <Terminal className="h-5 w-5 text-blue-400" />
                </div>
                <h2 className="text-lg font-semibold">Chat with Claude Code</h2>
                <p className="text-sm text-muted-foreground">Working in: <span className="font-mono">{effectiveDir.split('/').pop()}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {QUICK_PROMPTS.map(qp => (
                  <button key={qp} onClick={() => sendMessage(qp)} disabled={isStreaming}
                    className="text-left text-xs px-3 py-2.5 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground">
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col py-4 space-y-0.5">
              {hasMoreEvents && !loadingMore && (
                <div className="flex justify-center py-2">
                  <button
                    onClick={loadMoreEvents}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-full border border-border/50 hover:border-border"
                  >
                    Load earlier messages
                  </button>
                </div>
              )}
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} onRetry={retryWithPermission} />)}
              <div ref={threadEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border/60 bg-card/20">
          {!effectiveDir && !showProjectPicker && (
            <p className="text-xs text-muted-foreground text-center pt-3 px-4">
              Click <strong>New Chat</strong> to select a project directory
            </p>
          )}

          {/* Hidden image file input */}
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => {
              Array.from(e.target.files || []).slice(0, 4 - attachedImages.length).forEach(addImageFile);
              e.target.value = '';
            }}
          />

          {/* Attachment strip — images only (file refs appear inline in textarea) */}
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.dataUrl} alt="" className="h-12 w-12 object-cover rounded-lg border border-border" />
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative px-4 pt-3 pb-1">
            {/* Command palette */}
            {showCmdPalette && filteredCmds.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 font-medium uppercase tracking-wide">
                  Commands
                </div>
                {filteredCmds.map((cmd, i) => (
                  <button key={cmd.name}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${i === cmdSelectedIdx ? 'bg-muted/60' : 'hover:bg-muted/40'}`}
                    onClick={() => executeSlashCommand(cmd.name)}
                  >
                    <span className="text-xs font-mono font-semibold text-primary flex-shrink-0 w-24">/{cmd.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{cmd.desc}</span>
                    {cmd.local && <span className="ml-auto text-[9px] text-muted-foreground/50 flex-shrink-0">local</span>}
                  </button>
                ))}
              </div>
            )}

            {/* File picker */}
            {showFilePicker && (filePickerDirs.length > 0 || filePickerFiles.length > 0) && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 font-medium sticky top-0 bg-card flex items-center gap-1.5">
                  <AtSign className="h-3 w-3" />
                  {filePickerQuery ? filePickerQuery : 'Files'}
                </div>
                {filePickerDirs.map((dir, i) => (
                  <button key={dir}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${i === filePickerIdx ? 'bg-muted/60' : 'hover:bg-muted/40'}`}
                    onClick={() => selectDirMention(dir)}
                  >
                    <Folder className="h-3 w-3 text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-mono truncate flex-1">{dir}/</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                  </button>
                ))}
                {filePickerFiles.map((f, i) => (
                  <button key={f}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${i + filePickerDirs.length === filePickerIdx ? 'bg-muted/60' : 'hover:bg-muted/40'}`}
                    onClick={() => selectFileMention(f)}
                  >
                    <File className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono truncate">{f}</span>
                  </button>
                ))}
              </div>
            )}

            <textarea ref={textareaRef} value={prompt} onChange={handleTextareaChange} onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              disabled={isStreaming || !effectiveDir}
              placeholder={effectiveDir
                ? 'Message… (/ for commands, @ to reference a file, paste or drag images)'
                : 'Select a directory first…'}
              rows={1}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm bg-muted/40 border border-border focus:outline-none focus:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ maxHeight: '200px', overflow: 'auto' }} />
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-4 pb-3">
            {/* Left: Attach + Commands */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={!effectiveDir || isStreaming || attachedImages.length >= 4}
                title="Attach image (or paste/drag)"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>Attach</span>
              </button>
              <button
                onClick={() => {
                  if (showCmdPalette) {
                    setShowCmdPalette(false);
                    if (prompt === '/') setPrompt('');
                  } else {
                    setPrompt('/');
                    setShowCmdPalette(true);
                    setCmdQuery('');
                    setCmdSelectedIdx(0);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }
                }}
                disabled={!effectiveDir || isStreaming}
                title="Slash commands"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${showCmdPalette ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}
              >
                <Slash className="h-3.5 w-3.5" />
                <span>Commands</span>
              </button>
            </div>

            {/* Right: Stop / Send */}
            <div className="flex items-center gap-2">
              {isStreaming ? (
                <button onClick={stopStreaming} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors">
                  <Square className="h-3.5 w-3.5" />Stop
                </button>
              ) : (
                <button onClick={() => sendMessage(prompt)}
                  disabled={(!prompt.trim() && attachedImages.length === 0) || !effectiveDir}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Send className="h-3.5 w-3.5" />Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>{/* end splitContainerRef */}
    </div>

    {/* ── Right-click context menu ── */}
    {contextMenu && (
      <div
        className="fixed z-[200] bg-card border border-border/80 rounded-lg shadow-2xl py-1 min-w-[190px] overflow-hidden"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header: entry name */}
        <div className="px-3 py-1.5 mb-0.5 flex items-center gap-2 border-b border-border/60">
          {contextMenu.entry.type === 'directory'
            ? <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            : <FileIcon name={contextMenu.entry.name} />
          }
          <span className="text-[11px] font-medium text-muted-foreground truncate">{contextMenu.entry.name}</span>
        </div>

        {/* Directory-only actions */}
        {contextMenu.entry.type === 'directory' && (
          <>
            <button
              onClick={() => { startCreate(contextMenu.entry.path, false); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-muted/60 transition-colors text-left">
              <FilePlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              New File
            </button>
            <button
              onClick={() => { startCreate(contextMenu.entry.path, true); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-muted/60 transition-colors text-left">
              <FolderPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              New Folder
            </button>
            <div className="border-t border-border/50 my-1" />
          </>
        )}

        {/* Shared actions */}
        <button
          onClick={() => { startRename(contextMenu.entry.path, contextMenu.entry.name); setContextMenu(null); }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-muted/60 transition-colors text-left">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          Rename
        </button>
      </div>
    )}

    {/* ── Directory browser modal ── */}
    {showDirBrowser && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowDirBrowser(false); }}>
        <div className="w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Select Folder</h3>
            </div>
            <button onClick={() => setShowDirBrowser(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">
              ×
            </button>
          </div>

          {/* Breadcrumbs */}
          <div className="px-4 py-2 border-b border-border/50 bg-muted/20 shrink-0">
            <div className="flex items-center gap-0.5 text-xs flex-wrap min-h-[20px]">
              <button onClick={() => navigateBrowser('/')} className="text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/60 transition-colors">/</button>
              {browserPath.split('/').filter(Boolean).map((seg, i, arr) => (
                <span key={i} className="flex items-center">
                  <span className="text-muted-foreground/40 mx-0.5">/</span>
                  <button
                    onClick={() => navigateBrowser('/' + arr.slice(0, i + 1).join('/'))}
                    className={`px-1 py-0.5 rounded hover:bg-muted/60 transition-colors ${i === arr.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {seg}
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Directory list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {browserParent && (
              <button onClick={() => navigateBrowser(browserParent)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 text-sm text-muted-foreground border-b border-border/20 transition-colors">
                <ChevronRight className="h-3.5 w-3.5 rotate-180 shrink-0" />
                <span className="font-mono text-xs">..</span>
              </button>
            )}
            {browserLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />Loading…
              </div>
            ) : browserDirs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <FolderOpen className="h-8 w-8 opacity-20" />
                <p className="text-sm">No subdirectories</p>
              </div>
            ) : (
              browserDirs.map(dir => (
                <button key={dir} onClick={() => navigateBrowser(joinPath(browserPath, dir))}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 text-sm border-b border-border/20 transition-colors group">
                  <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="flex-1 text-left truncate">{dir}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
                </button>
              ))
            )}
          </div>

          {/* Footer with current path + actions */}
          <div className="px-4 py-3 border-t border-border bg-card/50 flex items-center gap-3 shrink-0">
            <p className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">{browserPath || '/'}</p>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowDirBrowser(false)} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/40 transition-colors">
                Cancel
              </button>
              <button onClick={confirmBrowserSelection} className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-medium transition-colors">
                Select this folder
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
