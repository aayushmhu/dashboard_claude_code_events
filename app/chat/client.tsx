'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import MonacoEditor from '@monaco-editor/react';
import { NotebookPreview } from './notebook-preview';
import {
  Bot, User, Send, Square, Plus, Terminal, FolderOpen, Folder,
  Copy, Check, AlertTriangle, ChevronDown, ChevronRight, BellRing,
  RefreshCw, AlertCircle, Clock, Coins, Settings,
  File, FileText, FileCode, X, Pencil, FilePlus, FolderPlus,
  Eye, ImageIcon, AtSign, Slash, Paperclip, Download,
  Crown, ShieldCheck, FlaskConical, Server, Layout, Cloud, Database, Lock, PauseCircle,
  Brain, GitBranch, Shield, ZoomIn, HelpCircle,
} from 'lucide-react';
import { TOOL_COLORS, BUBBLE_COLORS, ROLE_COLORS, getAgentColor } from '@/lib/colors';
import { formatCost, formatRelativeTime, formatDuration, formatTokens, truncateId, parseDbDate, formatAgentName, getAgentIconType, detectMessageType, calcCost, cn, uuid } from '@/lib/utils';
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
  /** Claude's tool_use.id — needed to send tool_result back for interactive tools (AskUserQuestion). */
  toolUseId?: string;
  agentType?: string;
  agentName?: string;
  permissionDenial?: { tool_name: string; tool_input: Record<string, unknown> };
  /** Multiple denials bundled from the same stream event (live), so they render as one card. */
  permissionDenials?: Array<{ tool_name: string; tool_input: Record<string, unknown> }>;
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

// Model options surfaced in the composer pill. `value: ''` means "let CLI default".
// Display label is shown on the pill; full ID is sent to the streaming endpoint.
const MODEL_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: '',                          label: 'Default',  hint: 'Use CLI default' },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet',   hint: 'Balanced · $3/M in · $15/M out' },
  { value: 'claude-opus-4-7',           label: 'Opus',     hint: 'Strongest · $5/M in · $25/M out' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku',    hint: 'Fastest · $1/M in · $5/M out' },
];

const CONTEXT_WINDOW = 200_000;

// Map a tool_use event to a friendly status line ("Reading client.tsx…",
// "Running command…"). Same approach as the VS Code Claude Code extension —
// the strings are extension-side, derived from the tool name and input.
function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  const filePath = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
  const fileName = filePath ? filePath.split('/').pop() : undefined;
  const editMode = input.edit_mode as string | undefined;
  const command = input.command as string | undefined;
  const url = input.url as string | undefined;
  const pattern = input.pattern as string | undefined;
  const description = input.description as string | undefined;

  switch (toolName) {
    case 'Bash':         return command ? `Running \`${command.slice(0, 60)}${command.length > 60 ? '…' : ''}\`` : 'Running command…';
    case 'Read':         return fileName ? `Reading ${fileName}…` : 'Reading file…';
    case 'Write':        return fileName ? `Writing ${fileName}…` : 'Writing file…';
    case 'Edit':         return fileName ? `Editing ${fileName}…` : 'Editing file…';
    case 'NotebookEdit': {
      const verb = editMode === 'delete' ? 'Deleting cell in'
                 : editMode === 'insert' ? 'Inserting cell in'
                 : 'Editing';
      return fileName ? `${verb} ${fileName}…` : 'Editing notebook…';
    }
    case 'Glob':         return pattern ? `Finding ${pattern}…` : 'Finding files…';
    case 'Grep':         return pattern ? `Searching for \`${pattern}\`…` : 'Searching codebase…';
    case 'LS':           return 'Listing directory…';
    case 'WebSearch':    return 'Searching the web…';
    case 'WebFetch':     return url ? `Fetching ${new URL(url).hostname}…` : 'Fetching web page…';
    case 'Task':         return description ? `Spawning agent: ${description}…` : 'Spawning subagent…';
    case 'Agent':        return description ? `Running agent: ${description}…` : 'Running subagent…';
    case 'TodoWrite':    return 'Updating todos…';
    case 'AskUserQuestion': return 'Asking you…';
    case 'Monitor':      return description ? `Monitoring: ${description}…` : 'Starting monitor…';
    case 'TaskStop':     return 'Stopping task…';
    case 'PushNotification': return 'Sending notification…';
    case 'CronCreate':   return 'Scheduling cron…';
    default:             return `${toolName}…`;
  }
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Local — handled by the dashboard
  { name: 'clear',    desc: 'Clear the conversation',                        local: true  },
  { name: 'help',     desc: 'Show available commands',                       local: true  },
  { name: 'cost',     desc: 'Show session token cost',                       local: true  },
  { name: 'model',    desc: 'Change the AI model',                           local: true  },
  { name: 'context',  desc: 'Show context-window usage on the latest turn',  local: true  },
  { name: 'usage',    desc: 'Show per-token-type breakdown for this session',local: true  },
  { name: 'status',   desc: 'Show session status (id, age, turns, cost)',    local: true  },
  { name: 'export',   desc: 'Download this session as a shareable HTML file',local: true  },
  { name: 'sessions', desc: 'Open the sessions list',                        local: true  },
  // Forwarded — sent to the CLI subprocess as a slash message
  { name: 'compact',  desc: 'Compact and summarize the conversation',        local: false },
  { name: 'review',   desc: 'Review recent code changes',                    local: false },
  { name: 'init',     desc: 'Create or update CLAUDE.md for this project',   local: false },
  { name: 'memory',   desc: 'Check and update memory files',                 local: false },
  { name: 'resume',   desc: 'Resume a previous session',                     local: false },
  { name: 'todos',    desc: 'Show / manage TODOs',                           local: false },
  { name: 'add-dir',  desc: 'Add a directory to the working set',            local: false },
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

function ChatToolCard({
  msg,
  onAnswerQuestion,
  isAnswered,
}: {
  msg: ChatMessage;
  onAnswerQuestion?: (toolUseId: string, answer: string) => void;
  isAnswered?: boolean;
}) {
  const toolColor = TOOL_COLORS[msg.toolName ?? ''] || '#64748B';

  // Special case: AskUserQuestion while streaming → render interactive UI
  // (rather than the generic "running…" placeholder). Other tools keep that.
  if (msg.isStreaming && msg.toolName === 'AskUserQuestion' && msg.toolUseId && onAnswerQuestion && !isAnswered) {
    return (
      <ToolCallCard
        toolName={msg.toolName}
        toolInput={msg.toolInput ?? null}
        toolOutput={null}
        isError={false}
        errorMessage={null}
        timestamp={msg.timestamp.toISOString()}
        onAnswerQuestion={(answer) => onAnswerQuestion(msg.toolUseId!, answer)}
      />
    );
  }

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

function PermissionDenialCard({
  msg,
  onRetry,
  onAnswerQuestion,
  isAnswered,
}: {
  msg: ChatMessage;
  onRetry?: (mode: RetryMode, allowedTools?: string[]) => void;
  onAnswerQuestion?: (answer: string) => void;
  isAnswered?: boolean;
}) {
  const d = msg.permissionDenial;
  // When multiple denials arrive in one stream event, they bundle into permissionDenials.
  // Render them as one card with one set of action buttons.
  const denials = msg.permissionDenials ?? (d ? [d] : []);
  const isMultiDenial = denials.length > 1;
  // Once the user clicks Allow, freeze the card and show a confirmation badge.
  const [approvedRetryMode, setApprovedRetryMode] = useState<RetryMode | null>(null);
  const approveLabel = (mode: RetryMode) =>
    mode === 'default' ? 'once'
    : mode === 'acceptEdits' ? 'file edits'
    : 'all';
  // Tool names from this card's denial(s) — passed as allowedTools on retry so
  // "Yes, allow once" actually grants those specific tools instead of just retrying
  // under the same default mode (which deterministically denies again).
  const deniedToolNames = Array.from(new Set(denials.map(x => x.tool_name).filter(Boolean)));
  const handleApprove = (mode: RetryMode) => {
    if (approvedRetryMode || !onRetry) return;
    setApprovedRetryMode(mode);
    // "Allow once" (mode=default) → pre-approve the specific tools so the retry actually proceeds.
    // The other modes (acceptEdits, bypass) take effect via permission mode alone — no per-tool list needed.
    const toolsForGrant = mode === 'default' ? deniedToolNames : undefined;
    onRetry(mode, toolsForGrant);
  };
  const [expanded, setExpanded] = useState(false);
  // Per-denial input-preview expand state (each tool's "Show what Claude asked" toggles independently)
  const [expandedDenialIdxs, setExpandedDenialIdxs] = useState<Set<number>>(new Set());
  // Per-question picks. Each value is an array — length 1 for single-select,
  // 0+ for multiSelect. Stored as arrays so we don't need two state shapes.
  const [pickedByQuestion, setPickedByQuestion] = useState<Record<number, string[]>>({});
  // Set once the bundled response is sent (multi-question) or auto-sent (single).
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const primaryInput = d?.tool_input
    ? (d.tool_input.command ?? d.tool_input.path ?? d.tool_input.description ?? Object.values(d.tool_input)[0])
    : null;
  // Stringify safely — objects/arrays were rendering as "[object Object]" (e.g. AskUserQuestion's questions[])
  const inputStr = primaryInput == null
    ? null
    : typeof primaryInput === 'object'
      ? JSON.stringify(primaryInput, null, 2)
      : String(primaryInput);
  const isHistorical = msg.isHistorical;

  // Bundle of N tool permission requests in one event → render as a single combined card.
  // (Same UX principle as multi-question AskUserQuestion: one prompt = one user choice.)
  if (isMultiDenial && !isHistorical) {
    const toggleDenial = (i: number) => {
      setExpandedDenialIdxs(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });
    };
    const denialInputStr = (denial: { tool_input?: Record<string, unknown> }) => {
      if (!denial.tool_input) return null;
      const ti = denial.tool_input;
      const v = (ti.command ?? ti.path ?? ti.description ?? Object.values(ti)[0]) as unknown;
      if (v == null) return null;
      return typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
    };

    return (
      <div className="rounded-lg p-3 text-sm flex items-start gap-2"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#F59E0B' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-medium" style={{ color: '#F59E0B' }}>
              {denials.length} permissions requested
            </p>
          </div>

          {/* Per-tool list */}
          <div className="mt-2 space-y-2">
            {denials.map((denial, i) => {
              const isOpen = expandedDenialIdxs.has(i);
              const preview = denialInputStr(denial);
              return (
                <div key={i} className="rounded px-2 py-1.5"
                  style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.22)', color: '#F59E0B' }}>
                      {denial.tool_name}
                    </span>
                    {preview && (
                      <button
                        onClick={() => toggleDenial(i)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {isOpen ? 'Hide input' : 'Show what Claude asked to do'}
                      </button>
                    )}
                  </div>
                  {isOpen && preview && (
                    <pre className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                      {preview}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>

          {/* One set of action buttons for the whole bundle — or confirmation badge once approved. */}
          {approvedRetryMode ? (
            <p className="mt-2.5 text-[11px] text-emerald-400/80">
              ✓ Allowed ({approveLabel(approvedRetryMode)})
            </p>
          ) : onRetry && (
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <button
                onClick={() => handleApprove('default')}
                className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.35)' }}
              >
                Yes, allow once
              </button>
              <button
                onClick={() => handleApprove('acceptEdits')}
                className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)' }}
              >
                Allow file edits
              </button>
              <button
                onClick={() => handleApprove('dangerouslySkipPermissions')}
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

  // Special case: when AskUserQuestion gets gated by permission, the CLI never lets
  // us reach the actual tool card — but the questions ARE present in tool_input.
  // Render them as the question card directly. Click → send answer as text;
  // the permission/dismissal dance happens server-side and we don't care.
  const isAskUserQuestion = d?.tool_name === 'AskUserQuestion';
  interface QItem { question?: string; header?: string; options?: Array<string | { label?: string; description?: string }>; multiSelect?: boolean }
  const questionsArr: QItem[] = isAskUserQuestion && Array.isArray(d?.tool_input?.questions)
    ? (d!.tool_input!.questions as QItem[])
    : [];
  const isQuestionMulti = (q: QItem | string): boolean => typeof q !== 'string' && !!q.multiSelect;
  // Historical AskUserQuestion — render the question read-only so users see what
  // Claude asked, instead of a raw JSON dump in the "Permission requested" card.
  if (isAskUserQuestion && questionsArr.length > 0 && isHistorical) {
    return (
      <div className="rounded-lg p-3 text-sm flex items-start gap-2"
        style={{ background: 'rgba(129,140,248,0.04)', border: '1px solid rgba(129,140,248,0.16)' }}>
        <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-indigo-400/60" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide font-medium">Claude asked</p>
          {questionsArr.map((raw, qi) => {
            const q = typeof raw === 'string'
              ? { text: raw, header: undefined, options: undefined as Array<string | { label?: string; description?: string }> | undefined }
              : { text: raw.question || raw.header || '', header: raw.header, options: raw.options };
            return (
              <div key={qi} className={qi > 0 ? 'pt-2 border-t border-white/[0.04]' : ''}>
                {q.header && q.header !== q.text && (
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">{q.header}</p>
                )}
                <p className="text-xs text-foreground/85 leading-relaxed">{q.text}</p>
                {q.options && q.options.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {q.options.map((opt, oi) => {
                      const label = typeof opt === 'string' ? opt : (opt.label || JSON.stringify(opt));
                      const desc  = typeof opt === 'string' ? undefined : opt.description;
                      return (
                        <div key={oi} className="flex items-baseline gap-2 px-1.5 py-0.5">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded border font-mono shrink-0"
                            style={{ borderColor: 'rgba(129,140,248,0.25)', color: '#A5B4FC', background: 'rgba(129,140,248,0.06)' }}
                          >
                            {label}
                          </span>
                          {desc && <span className="text-[10px] text-muted-foreground/60">{desc}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (isAskUserQuestion && questionsArr.length > 0 && !isHistorical && onAnswerQuestion) {
    const isMultiQuestion = questionsArr.length > 1;
    // Any question with multiSelect requires an explicit Submit (can't auto-submit on first pick).
    const anyMultiSelect = questionsArr.some(isQuestionMulti);
    const requireExplicitSubmit = isMultiQuestion || anyMultiSelect;
    const allAnswered = questionsArr.every((_, i) => (pickedByQuestion[i] ?? []).length > 0);
    const sent = submittedAnswer != null || isAnswered;

    const handlePick = (qIdx: number, label: string) => {
      if (sent) return;
      const q = questionsArr[qIdx];
      const multi = isQuestionMulti(q);
      setPickedByQuestion(prev => {
        const current = prev[qIdx] ?? [];
        let next: string[];
        if (multi) {
          // Toggle: add if not present, remove if present
          next = current.includes(label) ? current.filter(x => x !== label) : [...current, label];
        } else {
          // Single-select: replace
          next = [label];
        }
        return { ...prev, [qIdx]: next };
      });
      // Auto-submit ONLY for the simplest case: one question, single-select.
      if (!requireExplicitSubmit) {
        setSubmittedAnswer(label);
        onAnswerQuestion(label);
      }
    };

    const formatSubmission = (picks: Record<number, string[]>) => {
      // Pull labels per question; join multi-select with ", "
      return questionsArr.map((raw, i) => {
        const q = typeof raw === 'string' ? { text: raw, header: undefined } : { text: raw.question || raw.header || '', header: raw.header };
        const tag = q.header || q.text || `Q${i + 1}`;
        const answers = picks[i] ?? [];
        // For multi-question or multi-select, prefix with the question tag for clarity.
        return isMultiQuestion ? `${tag}: ${answers.join(', ')}` : answers.join(', ');
      }).join('\n');
    };

    const handleSubmit = () => {
      if (sent || !allAnswered) return;
      const combined = formatSubmission(pickedByQuestion);
      setSubmittedAnswer(combined);
      onAnswerQuestion(combined);
    };

    return (
      <div className="rounded-lg p-3 text-sm flex items-start gap-2"
        style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.20)' }}>
        <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-indigo-400" />
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-xs font-medium text-indigo-300/90">
            Claude is asking…
            {requireExplicitSubmit && (
              <span className="ml-2 text-[10px] text-muted-foreground/70 normal-case font-normal">
                {anyMultiSelect && isMultiQuestion ? 'select per question (some allow multiple), then submit'
                  : anyMultiSelect ? 'pick one or more, then submit'
                  : 'pick one per question, then submit'}
              </span>
            )}
          </p>
          {questionsArr.map((raw, qi) => {
            const q = typeof raw === 'string'
              ? { text: raw, header: undefined, options: undefined as Array<string | { label?: string; description?: string }> | undefined, multiSelect: false }
              : { text: raw.question || raw.header || '', header: raw.header, options: raw.options, multiSelect: !!raw.multiSelect };
            const picks = pickedByQuestion[qi] ?? [];
            return (
              <div key={qi} className={qi > 0 ? 'pt-3 border-t border-white/[0.06]' : ''}>
                {q.header && q.header !== q.text && (
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">
                    {q.header}
                  </p>
                )}
                <p className="text-xs font-medium text-foreground/90 leading-relaxed flex items-center gap-1.5 flex-wrap">
                  <span>{q.text}</span>
                  {q.multiSelect && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300/80 font-normal uppercase tracking-wide shrink-0">
                      multi-select
                    </span>
                  )}
                </p>
                {q.options && q.options.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {q.options.map((opt, oi) => {
                      const label = typeof opt === 'string' ? opt : (opt.label || JSON.stringify(opt));
                      const desc  = typeof opt === 'string' ? undefined : opt.description;
                      const isThis = picks.includes(label);
                      // Before submit: keep all options clickable so user can toggle (multi) or change (single).
                      // After submit: dim non-chosen, lock all.
                      const isDim  = sent && !isThis;
                      const disabled = sent;
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={disabled}
                          onClick={() => handlePick(qi, label)}
                          className={`text-left rounded px-1.5 py-1 -mx-1.5 transition-opacity ${
                            isDim ? 'opacity-30' : 'hover:bg-white/[0.04]'
                          } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <span className="flex items-baseline gap-2">
                            <span
                              className="text-[10px] px-2 py-0.5 rounded border font-mono shrink-0 transition-all"
                              style={{
                                borderColor: isThis ? '#818CF8' : 'rgba(129,140,248,0.40)',
                                color: isThis ? '#fff' : '#A5B4FC',
                                background: isThis ? '#818CF8' : 'rgba(129,140,248,0.10)',
                              }}
                            >
                              {label}
                            </span>
                            {desc && <span className="text-[10px] text-muted-foreground/70 text-left">{desc}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit button — shown when explicit submit is required (multi-question or any multi-select). */}
          {requireExplicitSubmit && !sent && (() => {
            const answeredQuestionCount = questionsArr.filter((_, i) => (pickedByQuestion[i] ?? []).length > 0).length;
            return (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!allAnswered}
                  onClick={handleSubmit}
                  className="text-[11px] px-3 py-1 rounded font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: allAnswered ? '#818CF8' : 'rgba(129,140,248,0.20)',
                    color: allAnswered ? '#fff' : '#A5B4FC',
                    border: '1px solid rgba(129,140,248,0.40)',
                  }}
                >
                  {isMultiQuestion
                    ? `Submit ${answeredQuestionCount}/${questionsArr.length}`
                    : 'Submit'}
                </button>
                <span className="text-[10px] text-muted-foreground/60">
                  {allAnswered ? 'ready to send' :
                    isMultiQuestion
                      ? `${questionsArr.length - answeredQuestionCount} remaining`
                      : 'pick at least one option'}
                </span>
              </div>
            );
          })()}

          {sent && (
            <p className="text-[10px] text-emerald-400/80">
              ✓ Sent
              {!isMultiQuestion && !anyMultiSelect && submittedAnswer && (
                <>: <span className="font-mono">{submittedAnswer}</span></>
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

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

  // ── Agent-specific rendering ──────────────────────────────────────────────
  const isAgentTool = d?.tool_name === 'Agent';
  if (isAgentTool) {
    const subagentType = (d?.tool_input?.subagent_type as string) || 'Agent';
    const description = d?.tool_input?.description as string | undefined;
    const agentColor = getAgentColor(subagentType);
    const displayName = formatAgentName(subagentType);

    return (
      <div className="rounded-lg p-3 text-sm flex items-start gap-2"
        style={{ background: agentColor.bg, border: `1px solid ${agentColor.border}` }}>
        <Bot className="h-4 w-4 mt-0.5 shrink-0" style={{ color: agentColor.text }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-medium" style={{ color: agentColor.text }}>
              Delegating to {displayName}
            </p>
            <span className="text-[10px] text-muted-foreground/70">
              Claude → {displayName}
            </span>
          </div>

          {description && (
            <p
              className="mt-1 text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-2"
              title={description}
            >
              {description}
            </p>
          )}

          {/* Raw JSON collapsed by default */}
          <details className="mt-1.5">
            <summary className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors select-none">
              Show full request
            </summary>
            <pre className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
              {JSON.stringify(d?.tool_input, null, 2)}
            </pre>
          </details>

          {/* Permission retry buttons — same as other tools */}
          {!isHistorical && onRetry && (
            approvedRetryMode ? (
              <p className="mt-2.5 text-[11px] text-emerald-400/80">
                Allowed ({approveLabel(approvedRetryMode)})
              </p>
            ) : (
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <button
                  onClick={() => handleApprove('default')}
                  className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                  style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.35)' }}
                >
                  Yes, allow once
                </button>
                <button
                  onClick={() => handleApprove('acceptEdits')}
                  className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)' }}
                >
                  Allow file edits
                </button>
                <button
                  onClick={() => handleApprove('dangerouslySkipPermissions')}
                  className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}
                >
                  Allow all
                </button>
              </div>
            )
          )}
        </div>
      </div>
    );
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

        {/* Permission retry options — only on live cards, never on historical reload. After
            an Allow button is clicked, the card freezes and shows a confirmation badge. */}
        {!isHistorical && onRetry && (
          approvedRetryMode ? (
            <p className="mt-2.5 text-[11px] text-emerald-400/80">
              ✓ Allowed ({approveLabel(approvedRetryMode)})
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <button
                onClick={() => handleApprove('default')}
                className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.35)' }}
              >
                Yes, allow once
              </button>
              <button
                onClick={() => handleApprove('acceptEdits')}
                className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)' }}
              >
                Allow file edits
              </button>
              <button
                onClick={() => handleApprove('dangerouslySkipPermissions')}
                className="text-[11px] px-2.5 py-1 rounded-md font-medium transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}
              >
                Allow all ⚠
              </button>
            </div>
          )
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

const MessageBubble = memo(function MessageBubble({
  msg,
  onRetry,
  onAnswerQuestion,
  isAnswered,
}: {
  msg: ChatMessage;
  onRetry?: (mode: RetryMode, allowedTools?: string[]) => void;
  onAnswerQuestion?: (toolUseId: string, answer: string) => void;
  isAnswered?: boolean;
}) {
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

  if (msg.role === 'tool') {
    // AskUserQuestion gets a dedicated interactive permission card. Suppress the
    // duplicate tool card so the question doesn't appear twice in the chat.
    if (msg.toolName === 'AskUserQuestion') return null;
    return <div className="my-2 px-4"><div className="max-w-[88%]"><ChatToolCard msg={msg} onAnswerQuestion={onAnswerQuestion} isAnswered={isAnswered} /></div></div>;
  }

  if (msg.role === 'permission_denial') {
    const card = (
      <PermissionDenialCard
        msg={msg}
        onRetry={onRetry}
        onAnswerQuestion={onAnswerQuestion ? (a) => onAnswerQuestion(msg.id, a) : undefined}
        isAnswered={isAnswered}
      />
    );
    // Live cards centered as "system needs your input" interstitial; historical
    // cards keep the old left-aligned chat-message layout so they don't disrupt
    // the scrollback look on reload.
    if (msg.isHistorical) {
      return <div className="my-2 px-4">{card}</div>;
    }
    return (
      <div className="my-3 px-4 flex justify-center">
        <div className="w-full max-w-[640px]">{card}</div>
      </div>
    );
  }

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

function MdContent({ content, onMarkdownLink }: { content: string; onMarkdownLink?: (href: string) => void }) {
  const componentsToUse = onMarkdownLink ? {
    ...mdComponents,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      if (!href || href.startsWith('http://') || href.startsWith('https://')) {
        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>;
      }
      return (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onMarkdownLink(href); }}
          className="text-primary hover:underline"
        >
          {children}
        </button>
      );
    },
  } : mdComponents;

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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsToUse}>{content}</ReactMarkdown>
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

// ─── Tab right-click context menu (portaled, top-level component) ─────────────

interface TabContextMenuPortalProps {
  ctx: { x: number; y: number; path: string } | null;
  openTabs: OpenFile[];
  editedBuffers: Map<string, string>;
  effectiveDir: string;
  onClose: () => void;
  onCloseTab: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseRight: (path: string) => void;
  onCloseSaved: () => void;
  onCloseAll: () => void;
  onMentionFile: (path: string) => void;
  onMoveTab: (path: string, dir: -1 | 1) => void;
  onRevealInTree: (path: string) => void;
  onOpenPreview: (path: string) => void;
  onFormat: (path: string) => void;
}

function TabContextMenuPortal(props: TabContextMenuPortalProps) {
  const { ctx, openTabs, editedBuffers, effectiveDir, onClose } = props;
  if (!ctx || typeof window === 'undefined') return null;

  const path = ctx.path;
  const idx = openTabs.findIndex(t => t.path === path);
  const tab = openTabs[idx];
  const hasRight = idx >= 0 && idx < openTabs.length - 1;
  const hasLeft  = idx > 0;
  const hasOthers = openTabs.length > 1;
  const hasSavedToClose = openTabs.some(t => {
    const buf = editedBuffers.get(t.path);
    return buf === undefined || buf === t.content;
  });
  const relPath = effectiveDir && path.startsWith(effectiveDir + '/') ? path.slice(effectiveDir.length + 1) : path;
  const isMarkdown = !!tab && tab.name.toLowerCase().endsWith('.md');
  const isFormatable = !!tab && !tab.isBinary && !tab.isPdf && !tab.isImage && !tab.tooLarge;

  const Btn = ({
    label, onAction, disabled = false, danger = false,
  }: { label: string; onAction: () => void; disabled?: boolean; danger?: boolean }) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onAction();
        onClose();
      }}
      className={cn(
        'w-full text-left px-3 py-1.5 text-xs transition-colors',
        disabled
          ? 'text-muted-foreground/40 cursor-not-allowed'
          : danger
            ? 'text-rose-400 hover:bg-rose-500/10'
            : 'hover:bg-muted/40 text-foreground/90'
      )}
    >
      {label}
    </button>
  );
  const Sep = () => <div className="h-px bg-border/50 my-1" />;

  return createPortal(
    <div
      className="fixed z-[300] bg-card border border-border/80 rounded-lg shadow-2xl py-1 min-w-[220px] overflow-hidden"
      style={{ left: ctx.x, top: ctx.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {tab && (
        <div className="px-3 py-1.5 mb-0.5 flex items-center gap-2 border-b border-border/60">
          <FileIcon name={tab.name} />
          <span className="text-[11px] font-mono truncate text-foreground/80">{tab.name}</span>
        </div>
      )}

      {/* Close group */}
      <Btn label="Close"               onAction={() => props.onCloseTab(path)} />
      <Btn label="Close Others"        disabled={!hasOthers}      onAction={() => props.onCloseOthers(path)} />
      <Btn label="Close to the Right"  disabled={!hasRight}       onAction={() => props.onCloseRight(path)} />
      <Btn label="Close Saved"         disabled={!hasSavedToClose} onAction={() => props.onCloseSaved()} />
      <Btn label="Close All"           danger                     onAction={() => props.onCloseAll()} />

      <Sep />

      {/* Copy / mention */}
      <Btn label="Copy Path"           onAction={() => navigator.clipboard.writeText(relPath)} />
      <Btn label="Copy Full Path"      onAction={() => navigator.clipboard.writeText(path)} />
      <Btn label="Add File to Chat"    disabled={!effectiveDir}   onAction={() => props.onMentionFile(path)} />

      <Sep />

      {/* Reorder */}
      <Btn label="Move to Left"        disabled={!hasLeft}        onAction={() => props.onMoveTab(path, -1)} />
      <Btn label="Move to Right"       disabled={!hasRight}       onAction={() => props.onMoveTab(path,  1)} />

      <Sep />

      {/* Open / format */}
      <Btn label="Reveal in File Explorer" onAction={() => props.onRevealInTree(path)} />
      <Btn label="Open Preview"            disabled={!isMarkdown}    onAction={() => props.onOpenPreview(path)} />
      <Btn label="Format File Content"     disabled={!isFormatable}  onAction={() => props.onFormat(path)} />
    </div>,
    document.body,
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ChatClient({
  initialSessions,
  initialSessionId,
  initialRoot,
  initialFrom,
}: {
  initialSessions: Session[];
  initialSessionId?: string;
  initialRoot?: string;
  initialFrom?: string;
}) {
  const router = useRouter();

  // Sessions (used only for project picker recent list)
  const [sessions] = useState<Session[]>(initialSessions);

  // File tree
  const [treeEntries, setTreeEntries] = useState<TreeEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [treeChildrenMap, setTreeChildrenMap] = useState<Map<string, TreeEntry[]>>(new Map());
  const [treeLoading, setTreeLoading] = useState(false);
  // Open tabs (VS Code-style multi-file editor)
  const [openTabs, setOpenTabs] = useState<OpenFile[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  // Per-tab edited buffer (unsaved content keyed by path)
  const [editedBuffers, setEditedBuffers] = useState<Map<string, string>>(new Map());
  // Tab right-click context menu
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  // Derived: active tab and its edited content (keeps existing JSX referencing openFile/editedContent working)
  const openFile = useMemo(
    () => activeTabPath ? (openTabs.find(t => t.path === activeTabPath) ?? null) : null,
    [openTabs, activeTabPath],
  );
  const editedContent = activeTabPath
    ? (editedBuffers.get(activeTabPath) ?? openFile?.content ?? '')
    : '';
  const setEditedContent = useCallback((v: string) => {
    if (!activeTabPath) return;
    setEditedBuffers(prev => {
      const next = new Map(prev);
      next.set(activeTabPath, v);
      return next;
    });
  }, [activeTabPath]);

  const [fileLoading, setFileLoading] = useState(false);
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
  // Transient status line shown while waiting for / processing Claude's response
  // (e.g., "Thinking…", "Running command…", "Reading client.tsx…"). Derived
  // client-side from stream events — same approach as the VS Code extension.
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
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
  // Honor ?root= only when it's strictly inside ~/.claude/projects/
  const safeInitialRoot = ((): string => {
    if (!initialRoot) return '';
    // Belt-and-suspenders client check: path must contain /.claude/projects/
    // The full OS path is passed (not tilde-form) from local-files-section/local-files-client.
    if (!initialRoot.includes('/.claude/projects/')) return '';
    return initialRoot;
  })();
  const [selectedDirectory, setSelectedDirectory] = useState(safeInitialRoot);
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

  // Composer model picker popover (portaled to body to escape composer's overflow-hidden)
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerRect, setModelPickerRect] = useState<DOMRect | null>(null);
  const modelPickerBtnRef = useRef<HTMLButtonElement>(null);
  const modelPickerPanelRef = useRef<HTMLDivElement>(null);

  // Drag-from-tree → drop-on-composer indicator
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  // Drop-target highlight when dragging a tree file over the editor panel
  const [isDragOverEditor, setIsDragOverEditor] = useState(false);
  // Drag-to-reorder tab: insertion index indicator (null = no drag in progress)
  const [tabDragInsertIdx, setTabDragInsertIdx] = useState<number | null>(null);

  // "Add to Chat" floating pill on Monaco text selection
  const [selectionPopover, setSelectionPopover] = useState<{
    top: number;
    left: number;
    text: string;
    startLine: number;
    endLine: number;
    relPath: string;
    lang: string;
  } | null>(null);

  // Monaco editor instance (kept in a ref so tab-context-menu actions can reach it)
  const monacoEditorRef = useRef<{ getAction?: (id: string) => { run: () => void } | null } | null>(null);

  // Active stream id (returned by /api/chat/stream's first `stream_init` event).
  // Used by /api/chat/respond to address the running subprocess for AskUserQuestion answers.
  const streamIdRef = useRef<string | null>(null);
  // Tool_use ids that have already been answered (avoids double-click sending two answers).
  const [answeredToolUseIds, setAnsweredToolUseIds] = useState<Set<string>>(new Set());

  // Always-fresh closure for "close the active tab" — read by Monaco's Cmd+W command
  // (registered once at mount; can't capture stale state through normal closure).
  const closeActiveTabRef = useRef<() => void>(() => {});

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
  // Auto-open MEMORY.md once when ?root= is set (root-locked file-viewer mode)
  const didAutoOpenMemoryRef = useRef(false);

  const effectiveDir = showCustomInput ? customDir : selectedDirectory;
  const activeSession = sessions.find(s => s.session_id === currentSessionId);

  // Fetch directories on mount
  useEffect(() => {
    fetch('/api/chat/directories').then(r => r.json()).then(setDirectories).catch(() => {});
  }, []);

  // Composer model picker — close on outside click / Escape. Click-outside check
  // covers BOTH the trigger button and the portaled panel.
  useEffect(() => {
    if (!showModelPicker) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inBtn = modelPickerBtnRef.current?.contains(target);
      const inPanel = modelPickerPanelRef.current?.contains(target);
      if (!inBtn && !inPanel) setShowModelPicker(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModelPicker(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showModelPicker]);

  // "Add to Chat" pill — Escape to dismiss
  useEffect(() => {
    if (!selectionPopover) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectionPopover(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectionPopover]);

  // Tab context menu — close on outside click / Escape.
  // Defer the click/contextmenu listeners by one tick so the right-click
  // that opened the menu doesn't immediately close it.
  useEffect(() => {
    if (!tabContextMenu) return;
    const close = () => setTabContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    let installed = false;
    const timer = setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('contextmenu', close);
      installed = true;
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      if (installed) {
        window.removeEventListener('click', close);
        window.removeEventListener('contextmenu', close);
      }
      window.removeEventListener('keydown', onKey);
    };
  }, [tabContextMenu]);

  // Re-focus the chat textarea when streaming finishes. Browsers blur disabled
  // elements automatically, so as soon as we flip `disabled` off (on the result
  // event) we want focus to return without the user clicking back in.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      // Defer to next tick so React has applied the `disabled={false}` first
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-grow textarea whenever `prompt` changes — including programmatic inserts
  // (drag-drop, slash commands, "Add to Chat"). Native onChange already handles
  // keyboard typing; this catches the cases that bypass it.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [prompt]);

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
    // Inline close-all (closeAllTabs helper is declared after this effect)
    setOpenTabs([]);
    setActiveTabPath(null);
    setEditedBuffers(new Map());
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

  // Tab helpers — VS Code-style
  const closeTab = useCallback((path: string) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.path === path);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.path !== path);
      // If closing the active tab, activate its right neighbor (or left if no right)
      if (activeTabPath === path) {
        const newActive = next[idx]?.path ?? next[idx - 1]?.path ?? null;
        setActiveTabPath(newActive);
      }
      return next;
    });
    setEditedBuffers(prev => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, [activeTabPath]);

  const closeOtherTabs = useCallback((keepPath: string) => {
    setOpenTabs(prev => prev.filter(t => t.path === keepPath));
    setActiveTabPath(keepPath);
    setEditedBuffers(prev => {
      const next = new Map<string, string>();
      if (prev.has(keepPath)) next.set(keepPath, prev.get(keepPath)!);
      return next;
    });
  }, []);

  const closeTabsToRight = useCallback((path: string) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.path === path);
      if (idx === -1) return prev;
      const keep = prev.slice(0, idx + 1);
      const keepPaths = new Set(keep.map(t => t.path));
      if (activeTabPath && !keepPaths.has(activeTabPath)) setActiveTabPath(path);
      setEditedBuffers(prevB => {
        const next = new Map<string, string>();
        for (const t of keep) if (prevB.has(t.path)) next.set(t.path, prevB.get(t.path)!);
        return next;
      });
      return keep;
    });
  }, [activeTabPath]);

  const closeAllTabs = useCallback(() => {
    setOpenTabs([]);
    setActiveTabPath(null);
    setEditedBuffers(new Map());
  }, []);

  // Close all tabs that have NO unsaved changes (dirty tabs stay).
  const closeSavedTabs = useCallback(() => {
    setOpenTabs(prev => {
      const keep = prev.filter(t => {
        const buf = editedBuffers.get(t.path);
        return buf !== undefined && buf !== t.content;
      });
      const keepPaths = new Set(keep.map(t => t.path));
      if (activeTabPath && !keepPaths.has(activeTabPath)) {
        setActiveTabPath(keep[0]?.path ?? null);
      }
      setEditedBuffers(prevB => {
        const next = new Map<string, string>();
        for (const t of keep) if (prevB.has(t.path)) next.set(t.path, prevB.get(t.path)!);
        return next;
      });
      return keep;
    });
  }, [editedBuffers, activeTabPath]);

  // Swap tab with its neighbor (direction: -1 = left, +1 = right).
  const moveTab = useCallback((path: string, direction: -1 | 1) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.path === path);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  // Keep the close-active-tab ref in sync every render (Monaco's command callback
  // is registered once at mount and would otherwise see stale state).
  closeActiveTabRef.current = () => {
    if (activeTabPath) closeTab(activeTabPath);
  };

  // Cmd/Ctrl+W → close the active editor tab. Two layers because the event can
  // be intercepted at different points depending on focus:
  //   1. Monaco-internal command (registered in onMount) handles it when focus is
  //      inside the editor — Monaco normally swallows Cmd+W before window listeners.
  //   2. Window-level capture listener handles every other focus state.
  // Both call closeActiveTabRef.current().
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'w') return;
      if (!activeTabPath) return;  // let the browser handle Cmd+W when no tab is open
      e.preventDefault();
      e.stopPropagation();
      closeActiveTabRef.current();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [activeTabPath]);

  // Drag-to-reorder: move `fromPath` to the given insertion index in openTabs.
  const reorderTabs = useCallback((fromPath: string, insertIdx: number) => {
    setOpenTabs(prev => {
      const fromIdx = prev.findIndex(t => t.path === fromPath);
      if (fromIdx === -1) return prev;
      // Adjust insertIdx if we're moving rightward (the source removal shifts indices left)
      let target = insertIdx;
      if (fromIdx < target) target -= 1;
      if (fromIdx === target) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }, []);

  // Insert @relPath at the composer's cursor (used by "Add File to Chat" menu item).
  // Mirrors the drag-drop pattern: tracks the file as a mention so backend resolves it.
  const insertFileMention = useCallback((fullPath: string) => {
    if (!effectiveDir) return;
    const relPath = fullPath.startsWith(effectiveDir + '/') ? fullPath.slice(effectiveDir.length + 1) : fullPath;
    const textarea = textareaRef.current;
    const insertAt = textarea?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, insertAt);
    const after = prompt.slice(insertAt);
    const needSpaceBefore = before && !before.endsWith(' ') ? ' ' : '';
    const needSpaceAfter = after && !after.startsWith(' ') ? ' ' : ' ';
    const inserted = needSpaceBefore + '@' + relPath + needSpaceAfter;
    setPrompt(before + inserted + after);
    const newCursor = before.length + inserted.length;
    setMentionedFiles(prev => prev.find(f => f.path === fullPath) ? prev : [...prev, { path: fullPath, relPath }]);
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }, [effectiveDir, prompt]);

  // Open this tab and switch to markdown preview mode (no-op visually for non-.md files).
  const openPreviewMode = useCallback((path: string) => {
    if (activeTabPath !== path) setActiveTabPath(path);
    setMdPreview('preview');
  }, [activeTabPath]);

  // Run Monaco's built-in formatter on the active editor model.
  // The editor is single-instance, so switch to the right tab first if needed.
  const formatFileContent = useCallback((path: string) => {
    if (activeTabPath !== path) setActiveTabPath(path);
    // Tiny delay so Monaco picks up the new value/language before formatting
    setTimeout(() => {
      const action = monacoEditorRef.current?.getAction?.('editor.action.formatDocument');
      action?.run();
    }, 50);
  }, [activeTabPath]);

  const downloadFile = useCallback(async (path: string, name: string) => {
    try {
      const res = await fetch(`/api/chat/fileraw?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        console.error('Download failed:', res.status);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  }, []);

  const openFileContent = useCallback(async (path: string) => {
    const isNotebook = path.endsWith('.ipynb');
    // Already open → just activate it
    if (openTabs.find(t => t.path === path)) {
      setActiveTabPath(path);
      setMdPreview(isNotebook ? 'preview' : 'edit');
      return;
    }
    setFileLoading(true);
    try {
      const res = await fetch(`/api/chat/filecontent?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      const file = { path, name: path.split('/').pop() || path, ...data } as OpenFile;
      setOpenTabs(prev => [...prev, file]);
      setEditedBuffers(prev => {
        const next = new Map(prev);
        next.set(path, data.content || '');
        return next;
      });
      setActiveTabPath(path);
      setMdPreview(isNotebook ? 'preview' : 'edit');
    } catch { /* silent */ } finally {
      setFileLoading(false);
    }
  }, [openTabs]);

  // Auto-open MEMORY.md on first load when root-locked (?root= mode)
  useEffect(() => {
    if (!safeInitialRoot) return;
    if (didAutoOpenMemoryRef.current) return;
    didAutoOpenMemoryRef.current = true;
    const memoryPath = `${safeInitialRoot}/memory/MEMORY.md`;
    openFileContent(memoryPath).catch(() => {
      // Silent — MEMORY.md doesn't exist for this project; fallback empty state will show
    });
  }, [safeInitialRoot, openFileContent]);

  const saveFile = useCallback(async () => {
    if (!openFile || saving) return;
    const path = openFile.path;
    const content = editedContent;
    setSaving(true);
    try {
      const res = await fetch('/api/chat/filecontent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      const data = await res.json();
      if (data.ok) {
        // Update the saved tab's content snapshot (so dirty indicator clears)
        setOpenTabs(prev => prev.map(t => t.path === path ? { ...t, content, size: data.size, lines: data.lines } : t));
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
        // Update any open tab whose path matches the renamed file
        if (renamingPath) {
          setOpenTabs(prev => prev.map(t => t.path === renamingPath ? { ...t, path: newPath, name } : t));
          setEditedBuffers(prev => {
            if (!prev.has(renamingPath)) return prev;
            const next = new Map(prev);
            const buf = next.get(renamingPath)!;
            next.delete(renamingPath);
            next.set(newPath, buf);
            return next;
          });
          if (activeTabPath === renamingPath) setActiveTabPath(newPath);
        }
      }
    } catch { /* silent */ }
    cancelEdit();
  }, [renamingPath, renameValue, activeTabPath, reloadDir, cancelEdit]);

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

    const sysMsg = (content: string) => setMessages(prev => [...prev, {
      id: uuid(), role: 'system' as const, content, timestamp: new Date(),
    }]);

    switch (name) {
      case 'clear':
        setMessages([]);
        setCurrentSessionId(null);
        router.push('/chat', { scroll: false });
        break;

      case 'help': {
        const lines = [
          'Available slash commands:',
          '',
          '  Local (handled here):',
          '    /clear     — clear the conversation',
          '    /cost      — show session cost',
          '    /context   — show context-window usage on the latest turn',
          '    /usage     — per-token-type breakdown for this session',
          '    /status    — session status (id, age, turns, cost)',
          '    /export    — download this session as a shareable HTML file',
          '    /sessions  — open the sessions list',
          '    /model     — change the model',
          '    /help      — this list',
          '',
          '  Forwarded to Claude:',
          '    /compact /review /init /memory /resume /todos /add-dir',
          '',
          'Tip: type @ to reference a file · paste or drag images to attach.',
        ];
        sysMsg(lines.join('\n'));
        break;
      }

      case 'cost':
        sysMsg(`Session cost: ${formatCost(sessionCost)}`);
        break;

      case 'context': {
        const lastA = [...messages].reverse().find(
          m => m.role === 'assistant' && (m.inputTokens || m.cacheCreationTokens || m.cacheReadTokens)
        );
        if (!lastA) {
          sysMsg('No turns yet — context usage will appear after the first assistant response.');
        } else {
          const used = (lastA.inputTokens ?? 0) + (lastA.cacheCreationTokens ?? 0) + (lastA.cacheReadTokens ?? 0);
          const pct = Math.round(used / CONTEXT_WINDOW * 100);
          sysMsg(
            `Context (latest turn): ${formatTokens(used)} / ${formatTokens(CONTEXT_WINDOW)} (${pct}% used · ${100 - pct}% until auto-compact)\n` +
            `Click the ring at the top of the composer — or run /compact — to summarise the conversation now.`
          );
        }
        break;
      }

      case 'usage': {
        if (!activeSession) { sysMsg('No active session yet.'); break; }
        const i  = activeSession.input_tokens ?? 0;
        const o  = activeSession.output_tokens ?? 0;
        const cw = activeSession.cache_creation_tokens ?? 0;
        const cr = activeSession.cache_read_tokens ?? 0;
        const totalCost = calcCost(i, o, cw, cr, activeSession.model);
        const lines = [
          'Session usage:',
          `  Input        ${formatTokens(i).padStart(8)}    ${formatCost(calcCost(i, 0, 0, 0, activeSession.model))}`,
          `  Output       ${formatTokens(o).padStart(8)}    ${formatCost(calcCost(0, o, 0, 0, activeSession.model))}`,
          `  Cache write  ${formatTokens(cw).padStart(8)}    ${formatCost(calcCost(0, 0, cw, 0, activeSession.model))}`,
          `  Cache read   ${formatTokens(cr).padStart(8)}    ${formatCost(calcCost(0, 0, 0, cr, activeSession.model))}`,
          `  ─────────────────────────────────────`,
          `  Total                  ${formatCost(totalCost)}`,
        ];
        sysMsg(lines.join('\n'));
        break;
      }

      case 'status': {
        if (!activeSession) { sysMsg('No active session yet.'); break; }
        const id    = activeSession.session_id?.slice(0, 8) ?? '—';
        const age   = activeSession.duration_seconds ? formatDuration(activeSession.duration_seconds) : '—';
        const turns = activeSession.event_count ?? 0;
        const cost  = formatCost(calcCost(
          activeSession.input_tokens ?? 0, activeSession.output_tokens ?? 0,
          activeSession.cache_creation_tokens ?? 0, activeSession.cache_read_tokens ?? 0,
          activeSession.model,
        ));
        const model = activeSession.model?.replace('claude-', '').replace(/-\d{8}$/, '') ?? 'default';
        const errs  = activeSession.error_count ?? 0;
        sysMsg(`Session ${id} · age ${age} · ${turns} events · ${cost} · ${model}${errs > 0 ? ` · ${errs} error${errs !== 1 ? 's' : ''}` : ''}`);
        break;
      }

      case 'export': {
        if (!currentSessionId) { sysMsg('No active session yet — start a turn first.'); break; }
        window.open(`/api/sessions/${currentSessionId}/export`, '_blank');
        sysMsg('Opening HTML export in a new tab…');
        break;
      }

      case 'sessions':
        router.push('/sessions');
        break;

      case 'model':
        setShowSettings(true);
        break;

      default:
        // Forwarded to the CLI subprocess
        sendMessageCore(`/${name}`, [], []);
    }
  }, [router, sessionCost, messages, activeSession, currentSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Internal drag from the file tree — custom MIME carries the relative path.
    // Inserted as @relPath at the cursor and tracked as a mentioned file so the
    // backend resolves it the same way as a typed @mention.
    const mention = e.dataTransfer.getData('application/x-chat-file-mention');
    if (mention) {
      e.preventDefault();
      const textarea = textareaRef.current;
      const insertAt = textarea?.selectionStart ?? prompt.length;
      const before = prompt.slice(0, insertAt);
      const after = prompt.slice(insertAt);
      const needSpaceBefore = before && !before.endsWith(' ');
      const needSpaceAfter = after && !after.startsWith(' ');
      const inserted = (needSpaceBefore ? ' ' : '') + '@' + mention + (needSpaceAfter ? ' ' : ' ');
      const newPrompt = before + inserted + after;
      setPrompt(newPrompt);
      const newCursor = before.length + inserted.length;
      const fullPath = effectiveDir ? `${effectiveDir}/${mention}` : mention;
      setMentionedFiles(prev => prev.find(f => f.path === fullPath) ? prev : [...prev, { path: fullPath, relPath: mention }]);
      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
      return;
    }
    // External drop — image files from the OS
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.slice(0, 4 - attachedImages.length).forEach(addImageFile);
  }, [attachedImages.length, addImageFile, prompt, effectiveDir]);

  // Quote the currently-selected editor text into the composer.
  // Mirrors the drag-drop insertion pattern: snippet at cursor + @mention tracking.
  const addSelectionToChat = useCallback(() => {
    if (!selectionPopover) return;
    const { text, startLine, endLine, relPath, lang } = selectionPopover;
    const lineRange = startLine === endLine ? `:${startLine}` : `:${startLine}-${endLine}`;
    const snippet = `@${relPath}${lineRange}\n\n\`\`\`${lang}\n${text}\n\`\`\`\n`;

    const textarea = textareaRef.current;
    const insertAt = textarea?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, insertAt);
    const after = prompt.slice(insertAt);
    const needNewlineBefore = before && !before.endsWith('\n') ? '\n' : '';
    const needNewlineAfter = after && !after.startsWith('\n') ? '\n' : '';
    const inserted = needNewlineBefore + snippet + needNewlineAfter;
    const newPrompt = before + inserted + after;
    setPrompt(newPrompt);
    const newCursor = before.length + inserted.length;

    const fullPath = effectiveDir ? `${effectiveDir}/${relPath}` : relPath;
    setMentionedFiles(prev => prev.find(f => f.path === fullPath) ? prev : [...prev, { path: fullPath, relPath }]);

    setSelectionPopover(null);
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }, [selectionPopover, prompt, effectiveDir]);

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
    options?: { isRetry?: boolean; allowedTools?: string[] },
  ) => {
    const dir = effectiveDir;
    if (!text.trim() || !dir || isStreaming) return;
    lastUserMsgRef.current = { text, imgs, files };

    // If a previous stream is still open in the background (subprocess kept stdin
    // alive after `result`), abort it cleanly before starting a new one. Otherwise
    // we'd accumulate orphan subprocesses.
    abortRef.current?.abort();

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsStreaming(true);
    setStreamingStatus('Thinking…');

    // On retry (Allow buttons on permission card), skip adding a duplicate user
    // bubble — the original "send" already added it, so adding again makes it
    // look like the user typed twice.
    if (!options?.isRetry) {
      setMessages(prev => [...prev, {
        id: uuid(), role: 'user', content: text, timestamp: new Date(),
        attachedImages: imgs.map(i => i.dataUrl),
        mentionedFiles: files.map(f => f.relPath),
      }]);
    }

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
          // Pre-approved tool names for this turn (e.g., 'Bash' after the user clicks
          // "Yes, allow once" on a permission denial card). Granular per-call grant.
          allowedTools: options?.allowedTools && options.allowedTools.length > 0 ? options.allowedTools : undefined,
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

            // First event on every stream — establishes the stream_id for follow-up POSTs
            if (event.type === 'stream_init') {
              const ev = event as { stream_id?: string };
              if (ev.stream_id) streamIdRef.current = ev.stream_id;
              continue;
            }

            if (event.type === 'system') {
              const ev = event as { subtype?: string; session_id?: string; slash_commands?: string[] };
              if (ev.subtype === 'init') {
                if (ev.session_id) {
                  setCurrentSessionId(ev.session_id);
                  // Use replaceState instead of router.push — navigating to /chat/[id]
                  // remounts ChatClient (different page component), aborting the live stream.
                  window.history.replaceState(null, '', `/chat/${ev.session_id}`);
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
                  id: uuid(), role: 'assistant',
                  content: textBlocks.map(b => b.text).join(''),
                  timestamp: new Date(),
                }]);
                // Once Claude starts producing text, no more "Thinking…" needed
                setStreamingStatus(null);
              }
              for (const block of toolBlocks) {
                const toolMsgId = uuid();
                if (block.id) pendingTools.set(block.id, toolMsgId);
                setMessages(prev => [...prev, {
                  id: toolMsgId, role: 'tool', content: '',
                  toolName: block.name, toolInput: block.input,
                  toolOutput: null, isStreaming: true, timestamp: new Date(),
                  toolUseId: block.id,
                }]);
                // Update status line to reflect the currently-running tool.
                setStreamingStatus(formatToolStatus(block.name, block.input));
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
              // After a tool returns, briefly show "Thinking…" again while Claude
              // decides what to do next (next tool, or a final text response).
              if (pendingTools.size === 0) setStreamingStatus('Thinking…');
              continue;
            }

            if (event.type === 'result') {
              const ev = event as {
                total_cost_usd?: number;
                usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
                permission_denials?: Array<{ tool_name: string; tool_input: Record<string, unknown> }>;
              };
              // End-of-turn — enable the input + clear the status line. The stream
              // stays open (subprocess keeps stdin open), so the finally-block's
              // setIsStreaming(false) never runs on its own.
              setIsStreaming(false);
              setStreamingStatus(null);
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
              // Bundle ALL permission denials from this event into a single message
              // so the user sees one consolidated card with one set of action buttons,
              // not N separate cards (was confusing when Claude requested permission
              // for multiple tools in the same turn).
              const denials = ev.permission_denials ?? [];
              if (denials.length === 1) {
                setMessages(prev => [...prev, {
                  id: uuid(), role: 'permission_denial',
                  content: `Permission denied: ${denials[0].tool_name}`,
                  timestamp: new Date(),
                  permissionDenial: denials[0],
                }]);
              } else if (denials.length > 1) {
                const toolList = denials.map(d => d.tool_name).join(', ');
                setMessages(prev => [...prev, {
                  id: uuid(), role: 'permission_denial',
                  content: `Permission denied: ${toolList}`,
                  timestamp: new Date(),
                  permissionDenials: denials,
                }]);
              }
              continue;
            }

            if (event.type === 'error') {
              const message = String((event as { message?: unknown }).message || 'Unknown error');
              let display = `Error: ${message}`;
              if (message.includes('ENOENT') || message.toLowerCase().includes('not found')) display = 'Claude Code not installed. Run: npm i -g @anthropic-ai/claude-code';
              else if (message.toLowerCase().includes('auth')) display = 'Not authenticated. Run `claude auth login` in your terminal first.';
              setMessages(prev => [...prev, { id: uuid(), role: 'system', content: display, timestamp: new Date(), isError: true }]);
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => [...prev, { id: uuid(), role: 'system', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, timestamp: new Date(), isError: true }]);
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

  // Answer an in-flight AskUserQuestion. Originally we POSTed to /api/chat/respond
  // (writing tool_result via the open subprocess stdin), but that's fragile —
  // the CLI may exit shortly after emitting `result`, in which case the stdin
  // write silently no-ops and the answer never reaches Claude (UI shows "Sent"
  // but on reload the answer is gone — see bug report).
  //
  // Fix: route the answer through the standard /api/chat/stream path, which
  // spawns a fresh subprocess with --resume to continue the same session.
  // The answer appears as a user message bubble (sendMessage handles that) and
  // gets properly logged to the DB by the hook chain, surviving page reloads.
  const answerInteractiveQuestion = useCallback((toolUseId: string, answer: string) => {
    setAnsweredToolUseIds(prev => {
      const next = new Set(prev);
      next.add(toolUseId);
      return next;
    });
    sendMessage(answer);
  }, [sendMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry last user message under a new permission posture.
  // `mode` controls global permission mode (default/acceptEdits/dangerouslySkipPermissions).
  // `allowedTools` (optional) pre-approves specific tools by name — passed when the user
  // clicks "Yes, allow once" so the SPECIFIC denied tools succeed on retry, instead of
  // hitting the same denial because the mode is unchanged.
  const retryWithPermission = useCallback((mode: RetryMode, allowedTools?: string[]) => {
    const last = lastUserMsgRef.current;
    if (!last || isStreaming) return;
    sendMessageCore(last.text, last.imgs, last.files, mode, { isRetry: true, allowedTools });
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
          const relPath = effectiveDir && entry.path.startsWith(effectiveDir + '/')
            ? entry.path.slice(effectiveDir.length + 1)
            : entry.name;
          return (
            <button key={entry.path} style={{ paddingLeft: pad }}
              onClick={() => openFileContent(entry.path)}
              onContextMenu={e => openContextMenu(e, entry)}
              draggable={!isRenaming}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-chat-file-mention', relPath);
                // text/plain fallback so other targets (or accidental drops outside) get a sensible value
                e.dataTransfer.setData('text/plain', '@' + relPath);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className={`w-full flex items-center gap-2 py-[3px] pr-3 text-[12px] rounded-sm transition-colors cursor-grab active:cursor-grabbing ${isActive ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
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
        const dirRelPath = effectiveDir && entry.path.startsWith(effectiveDir + '/')
          ? entry.path.slice(effectiveDir.length + 1)
          : entry.name;
        return (
          <div key={entry.path}>
            <button style={{ paddingLeft: pad }}
              onClick={() => toggleDir(entry.path)}
              onContextMenu={e => openContextMenu(e, entry)}
              draggable={!isRenaming}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-chat-file-mention', dirRelPath);
                e.dataTransfer.setData('text/plain', '@' + dirRelPath);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="w-full flex items-center gap-1.5 py-[3px] pr-3 text-[12px] text-foreground/75 hover:text-foreground hover:bg-white/5 rounded-sm transition-colors cursor-grab active:cursor-grabbing">
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

        {/* Root-locked banner: shown when ?root= is set */}
        {safeInitialRoot && (
          <div className="px-3 py-2 border-b border-border/60 bg-amber-500/8 flex items-center justify-between gap-2">
            <span className="text-[11px] text-amber-400/90 leading-tight min-w-0 truncate">
              Local files: <code className="font-mono">{safeInitialRoot.split('/').pop()}</code>
            </span>
            <Link
              href={initialFrom ? `/projects/detail?project=${encodeURIComponent(initialFrom)}` : '/chat'}
              className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors flex-shrink-0"
            >
              Exit ↗
            </Link>
          </div>
        )}

        {/* Collapsible settings */}
        {showSettings && (
          <div className="p-3 border-b border-border/60 space-y-3 bg-muted/10">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Directory</label>
              {!safeInitialRoot && (
                <>
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
                </>
              )}
              {safeInitialRoot && (
                <p className="text-xs font-mono text-muted-foreground truncate px-2 py-1.5 bg-muted/20 rounded-lg border border-border/40">
                  {safeInitialRoot.split('/').pop()}
                </p>
              )}
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
        <div
          className={cn(
            'flex flex-col border-r border-border/60 relative transition-colors',
            safeInitialRoot ? 'flex-1 min-w-0' : 'shrink-0',
            isDragOverEditor && 'ring-2 ring-primary/40 ring-inset',
          )}
          style={safeInitialRoot
            ? { background: 'hsl(var(--card))' }
            : { width: `${filePanelPct}%`, background: 'hsl(var(--card))' }
          }
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/x-chat-file-mention')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setIsDragOverEditor(true);
          }}
          onDragLeave={(e) => {
            const rt = e.relatedTarget as Node | null;
            if (rt && e.currentTarget.contains(rt)) return;
            setIsDragOverEditor(false);
          }}
          onDrop={(e) => {
            setIsDragOverEditor(false);
            const relPath = e.dataTransfer.getData('application/x-chat-file-mention');
            if (!relPath || !effectiveDir) return;
            e.preventDefault();
            openFileContent(`${effectiveDir}/${relPath}`);
          }}
        >
          {/* Tab bar — multi-file, VS Code style */}
          <div className="shrink-0 flex items-stretch border-b border-border/60 bg-muted/20" style={{ minHeight: 36 }}>
            {/* Tab strip — horizontally scrollable */}
            <div
              className="flex items-stretch overflow-x-auto flex-1 min-w-0 relative"
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('application/x-editor-tab-reorder')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                const fromPath = e.dataTransfer.getData('application/x-editor-tab-reorder');
                if (!fromPath || tabDragInsertIdx === null) return;
                e.preventDefault();
                reorderTabs(fromPath, tabDragInsertIdx);
                setTabDragInsertIdx(null);
              }}
            >
              {openTabs.map((tab, idx) => {
                const isActive = tab.path === activeTabPath;
                const tabBuf = editedBuffers.get(tab.path);
                const isDirty = tabBuf !== undefined && tabBuf !== tab.content;
                return (
                  <div
                    key={tab.path}
                    onClick={() => { setActiveTabPath(tab.path); setMdPreview('edit'); }}
                    onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.path); } }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-editor-tab-reorder', tab.path);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes('application/x-editor-tab-reorder')) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      const rect = e.currentTarget.getBoundingClientRect();
                      const isLeftHalf = e.clientX < rect.left + rect.width / 2;
                      setTabDragInsertIdx(isLeftHalf ? idx : idx + 1);
                    }}
                    onDragLeave={(e) => {
                      // Clear only when leaving the tab strip entirely (not when moving to a sibling)
                      const rt = e.relatedTarget as Node | null;
                      if (rt && e.currentTarget.parentElement?.contains(rt)) return;
                      setTabDragInsertIdx(null);
                    }}
                    onDragEnd={() => setTabDragInsertIdx(null)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Estimate menu height (~14 rows × 28px ≈ 392px). Flip up if it would
                      // overflow the viewport bottom; clamp left so it doesn't run off-right.
                      const estHeight = 410;
                      const estWidth = 240;
                      const viewportH = window.innerHeight;
                      const viewportW = window.innerWidth;
                      let y = e.clientY;
                      if (y + estHeight > viewportH - 8) y = Math.max(8, viewportH - estHeight - 8);
                      let x = e.clientX;
                      if (x + estWidth > viewportW - 8) x = Math.max(8, viewportW - estWidth - 8);
                      setTabContextMenu({ x, y, path: tab.path });
                    }}
                    className={cn(
                      'group relative flex items-center gap-2 pl-3 pr-1.5 py-1.5 border-r border-border/40 cursor-pointer transition-colors shrink-0 max-w-[200px]',
                      isActive
                        ? 'bg-card/80 text-foreground/95'
                        : 'text-muted-foreground/80 hover:bg-card/40 hover:text-foreground/90'
                    )}
                    title={tab.path}
                  >
                    {isActive && <span className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />}
                    {tabDragInsertIdx === idx && (
                      <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary rounded-full" />
                    )}
                    {tabDragInsertIdx === idx + 1 && idx === openTabs.length - 1 && (
                      <span className="absolute right-0 top-1 bottom-1 w-[2px] bg-primary rounded-full" />
                    )}
                    <FileIcon name={tab.name} />
                    <span className="text-[12px] font-medium truncate">{tab.name}</span>
                    {isDirty && !isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved" />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                      className={cn(
                        'ml-0.5 w-4 h-4 flex items-center justify-center rounded shrink-0 hover:bg-muted/60 text-muted-foreground/50 hover:text-foreground transition-colors',
                        isActive ? 'opacity-100' : isDirty ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      )}
                    >
                      {isActive && isDirty ? (
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            {!openFile.isBinary && !openFile.isPdf && !openFile.isImage && !openFile.tooLarge && (
              <div className="flex items-center gap-1 mr-2">
                {/* Back-to-edit toggle (only visible when in preview). "Open Preview" lives in the tab right-click menu. */}
                {(openFile.name.endsWith('.md') || openFile.name.endsWith('.ipynb')) && mdPreview === 'preview' && (
                  <button
                    onClick={() => setMdPreview('edit')}
                    title={openFile.name.endsWith('.ipynb') ? 'View raw JSON' : 'Back to editor'}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <FileCode className="h-3 w-3" />
                    {openFile.name.endsWith('.ipynb') ? 'Raw' : 'Edit'}
                  </button>
                )}
                {openFile.name.endsWith('.ipynb') && mdPreview === 'edit' && (
                  <button
                    onClick={() => setMdPreview('preview')}
                    title="Preview notebook"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <FileCode className="h-3 w-3" />
                    Preview
                  </button>
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
            ) : mdPreview === 'preview' && openFile.name.endsWith('.ipynb') ? (
              <NotebookPreview content={editedContent} onChange={setEditedContent} />
            ) : mdPreview === 'preview' ? (
              <MdContent
                content={editedContent}
                onMarkdownLink={(href) => {
                  if (!openFile) return;
                  const lastSlash = openFile.path.lastIndexOf('/');
                  const currentDir = lastSlash >= 0 ? openFile.path.substring(0, lastSlash) : openFile.path;
                  const cleaned = href.replace(/^\.\//, '');
                  if (cleaned.startsWith('..') || cleaned.includes('/..')) return;
                  const targetPath = cleaned.startsWith('/') ? cleaned : `${currentDir}/${cleaned}`;
                  openFileContent(targetPath);
                }}
              />
            ) : (
              <MonacoEditor
                height="100%"
                language={getMonacoLang(openFile.name)}
                value={editedContent}
                onChange={v => setEditedContent(v ?? '')}
                theme="vs-dark"
                onMount={(editor, monaco) => {
                  monacoEditorRef.current = editor as unknown as { getAction?: (id: string) => { run: () => void } | null };
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => saveFile(),
                  );
                  // Cmd/Ctrl+W → close the active tab. Monaco normally consumes this
                  // before our window listener can; registering it as a Monaco command
                  // ensures it fires even when editor focus is the obstacle.
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW,
                    () => closeActiveTabRef.current(),
                  );

                  // Selection change → show the "Add to Chat" floating pill
                  editor.onDidChangeCursorSelection(() => {
                    const selection = editor.getSelection();
                    if (!selection || selection.isEmpty()) {
                      setSelectionPopover(null);
                      return;
                    }
                    const model = editor.getModel();
                    if (!model) return;
                    const text = model.getValueInRange(selection);
                    if (!text.trim()) {
                      setSelectionPopover(null);
                      return;
                    }
                    const endPos = selection.getEndPosition();
                    const visiblePos = editor.getScrolledVisiblePosition(endPos);
                    if (!visiblePos) return;
                    const editorEl = editor.getDomNode();
                    if (!editorEl) return;
                    const rect = editorEl.getBoundingClientRect();
                    const pillHeight = 32;
                    const margin = 8;
                    // Try BELOW selection end; flip ABOVE start if it would overflow viewport bottom
                    const lineHeight = 18;
                    let top = rect.top + visiblePos.top + lineHeight + margin;
                    if (top + pillHeight > window.innerHeight - 12) {
                      const startPos = selection.getStartPosition();
                      const startVisible = editor.getScrolledVisiblePosition(startPos);
                      if (startVisible) top = rect.top + startVisible.top - pillHeight - margin;
                    }
                    let left = rect.left + visiblePos.left + margin;
                    // Keep pill in the editor's horizontal bounds (with a 200px-ish budget)
                    left = Math.min(left, rect.right - 160);
                    left = Math.max(left, rect.left + 8);

                    // openFile is in scope here; safe to compute relPath
                    const relPath = openFile && effectiveDir && openFile.path.startsWith(effectiveDir + '/')
                      ? openFile.path.slice(effectiveDir.length + 1)
                      : openFile?.name ?? '';

                    setSelectionPopover({
                      top,
                      left,
                      text,
                      startLine: selection.startLineNumber,
                      endLine: selection.endLineNumber,
                      relPath,
                      lang: openFile?.language || '',
                    });
                  });

                  // Hide pill while scrolling; user can re-select to bring it back
                  editor.onDidScrollChange(() => setSelectionPopover(null));
                  editor.onDidBlurEditorWidget(() => {
                    // Tiny delay so a click on the pill itself still fires before this clears state
                    setTimeout(() => setSelectionPopover(null), 150);
                  });
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

      {/* ── Resize handle (only when file is open AND not in locked root mode) ── */}
      {openFile && !safeInitialRoot && (
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
      {!safeInitialRoot && <div className="flex-1 flex flex-col min-w-0">
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
          ) : messages.length === 0 && showProjectPicker && !safeInitialRoot ? (
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
          ) : safeInitialRoot && !openFile ? (
            /* ── Root-locked mode: no file open yet ── */
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Click a file in the explorer to view
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
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onRetry={retryWithPermission}
                  onAnswerQuestion={answerInteractiveQuestion}
                  isAnswered={msg.toolUseId ? answeredToolUseIds.has(msg.toolUseId) : false}
                />
              ))}
              <div ref={threadEndRef} />
            </div>
          )}
        </div>

        {/* Input area — hidden in root-locked (?root=) mode */}
        {!safeInitialRoot && <div className="shrink-0 border-t border-border/60 bg-card/20">
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

          <div className="relative px-4 pt-1.5 pb-1">
            {/* Command palette */}
            {showCmdPalette && filteredCmds.length > 0 && (() => {
              // Split into sections: dashboard built-in vs user-custom (from ~/.claude/commands/*.md
              // discovered via the CLI's system.init event)
              const builtinNames = new Set(SLASH_COMMANDS.map(c => c.name));
              const builtin = filteredCmds.filter(c => builtinNames.has(c.name));
              const custom  = filteredCmds.filter(c => !builtinNames.has(c.name));
              const sections: Array<{ label: string; items: SlashCommand[] }> = [];
              if (builtin.length) sections.push({ label: 'Built-in', items: builtin });
              if (custom.length)  sections.push({ label: 'Custom', items: custom });

              // Map a (section, item-in-section) pair back to the flat selected index used by keyboard nav
              let flatIdx = -1;
              return (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-[400px] overflow-y-auto">
                  {sections.map(section => (
                    <div key={section.label}>
                      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 font-medium uppercase tracking-wide sticky top-0 bg-card">
                        {section.label}
                        {section.label === 'Custom' && (
                          <span className="ml-2 text-[9px] text-muted-foreground/60 normal-case font-normal">
                            from ~/.claude/commands/
                          </span>
                        )}
                      </div>
                      {section.items.map(cmd => {
                        flatIdx += 1;
                        const i = flatIdx;
                        return (
                          <button key={cmd.name}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${i === cmdSelectedIdx ? 'bg-muted/60' : 'hover:bg-muted/40'}`}
                            onClick={() => executeSlashCommand(cmd.name)}
                          >
                            <span className="text-xs font-mono font-semibold text-primary flex-shrink-0 w-24">/{cmd.name}</span>
                            <span className="text-xs text-muted-foreground truncate flex-1">{cmd.desc || '—'}</span>
                            {cmd.local && <span className="text-[9px] text-muted-foreground/50 flex-shrink-0">local</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}

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

            {/* Live status line — VS Code-extension style. Replaces itself as
                stream events arrive ("Thinking…" → "Reading file.tsx…" →
                "Running command…" → cleared on result). */}
            {streamingStatus && (
              <div className="px-4 pb-1 -mt-1 flex items-center gap-2 text-[11px] text-muted-foreground animate-pulse">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                <span className="font-mono truncate">{streamingStatus}</span>
              </div>
            )}

            {/* ─── Unified composer card: textarea + streaming bar + toolbar ─── */}
            {(() => {
              // Context-window usage = the size of the LATEST prompt sent to the model
              // (input + cache_creation + cache_read on the most recent assistant turn).
              // NOT the cumulative session total — that grows unboundedly across turns
              // even when each turn's prompt fits comfortably in the context window.
              const lastAssistant = [...messages].reverse().find(
                m => m.role === 'assistant' && (m.inputTokens || m.cacheCreationTokens || m.cacheReadTokens)
              );
              const tokensUsed = lastAssistant
                ? (lastAssistant.inputTokens ?? 0)
                  + (lastAssistant.cacheCreationTokens ?? 0)
                  + (lastAssistant.cacheReadTokens ?? 0)
                : 0;
              const currentModelLabel = MODEL_OPTIONS.find(m => m.value === selectedModel)?.label ?? 'Default';
              const insertAtMention = () => {
                const next = prompt + (prompt && !prompt.endsWith(' ') ? ' @' : '@');
                setPrompt(next);
                setTimeout(() => textareaRef.current?.focus(), 0);
              };

              return (
                <div className={cn(
                  'rounded-xl border bg-background/40 transition-colors overflow-hidden',
                  isDragOverComposer
                    ? 'border-primary/60 bg-primary/5 ring-2 ring-primary/20'
                    : 'focus-within:border-primary/40 border-border',
                )}>
                  <textarea ref={textareaRef} value={prompt} onChange={handleTextareaChange} onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onDrop={(e) => { setIsDragOverComposer(false); handleDrop(e); }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.types.includes('application/x-chat-file-mention')) {
                        e.dataTransfer.dropEffect = 'copy';
                      }
                    }}
                    onDragEnter={(e) => {
                      if (e.dataTransfer.types.includes('application/x-chat-file-mention')) {
                        setIsDragOverComposer(true);
                      }
                    }}
                    onDragLeave={() => setIsDragOverComposer(false)}
                    disabled={isStreaming || !effectiveDir}
                    placeholder={effectiveDir
                      ? 'Message… (/ for commands, @ to reference a file, paste or drag images)'
                      : 'Select a directory first…'}
                    rows={1}
                    className="w-full resize-none px-3.5 pt-2 pb-1.5 text-sm bg-transparent border-0 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed leading-snug"
                    style={{ maxHeight: '200px', overflow: 'auto' }} />

                  {/* Streaming gradient bar (replaces the divider while streaming) */}
                  {isStreaming ? (
                    <div className="h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse" />
                  ) : (
                    <div className="h-px bg-border/40" />
                  )}

                  {/* Row 2 toolbar */}
                  <div className="flex items-center justify-between gap-2 px-1.5 py-1">
                    {/* Left cluster: Attach · Commands · @ Ref · Model pill */}
                    <div className="flex items-center gap-0.5 min-w-0">
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={!effectiveDir || isStreaming || attachedImages.length >= 4}
                        title="Attach image (or paste/drag)"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Attach</span>
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
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                          showCmdPalette ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                      >
                        <Slash className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Commands</span>
                      </button>
                      <button
                        onClick={insertAtMention}
                        disabled={!effectiveDir || isStreaming}
                        title="Reference a file (@)"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <AtSign className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Reference</span>
                      </button>

                      {/* Model pill — dropdown is portaled (see bottom of file) */}
                      <button
                        ref={modelPickerBtnRef}
                        onClick={() => {
                          if (showModelPicker) {
                            setShowModelPicker(false);
                          } else {
                            const rect = modelPickerBtnRef.current?.getBoundingClientRect();
                            if (rect) setModelPickerRect(rect);
                            setShowModelPicker(true);
                          }
                        }}
                        disabled={isStreaming}
                        title="Change model"
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1.5 ml-1 rounded-lg text-xs transition-colors',
                          'bg-muted/40 hover:bg-muted/70 text-foreground/80',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                          showModelPicker && 'bg-muted/70 text-foreground'
                        )}
                      >
                        <span className="font-medium">{currentModelLabel}</span>
                        <ChevronDown className={cn('h-3 w-3 transition-transform', showModelPicker && 'rotate-180')} />
                      </button>
                    </div>

                    {/* Right cluster: context ring (click → /compact) · ⌘↩ hint · Send/Stop */}
                    <div className="flex items-center gap-2 shrink-0">
                      {tokensUsed > 0 && (() => {
                        const usedPct = Math.min(100, (tokensUsed / CONTEXT_WINDOW) * 100);
                        const remainingPct = Math.max(0, Math.round(100 - usedPct));
                        const usedPctRounded = Math.round(usedPct);
                        // Ring color carries the state. No inline label — keeps the icon
                        // consistent with every other toolbar button (hover-only bg, fixed footprint).
                        const ringStroke =
                          usedPct >= 80 ? '#F87171' :
                          usedPct >= 50 ? '#FBBF24' :
                          '#A5B4FC';
                        const radius = 7;
                        const circumference = 2 * Math.PI * radius;
                        const offset = circumference * (1 - usedPct / 100);
                        return (
                          <Tooltip delayDuration={150}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => executeSlashCommand('compact')}
                                disabled={isStreaming}
                                aria-label={`${usedPctRounded}% of context used. Click to compact.`}
                                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                                  <circle cx="9" cy="9" r={radius} fill="none"
                                    stroke="hsl(var(--border))" strokeWidth="2" strokeOpacity="0.6" />
                                  <circle cx="9" cy="9" r={radius} fill="none"
                                    stroke={ringStroke} strokeWidth="2" strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={offset}
                                    transform="rotate(-90 9 9)"
                                    style={{ transition: 'stroke-dashoffset 300ms ease-out, stroke 200ms' }} />
                                </svg>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[240px] leading-snug">
                              <p className="font-medium">
                                {usedPctRounded}% of context used · {remainingPct}% until auto-compact
                              </p>
                              <p className="text-[10px] opacity-70 mt-1 font-mono">
                                {formatTokens(tokensUsed)} / {formatTokens(CONTEXT_WINDOW)} on the latest turn
                              </p>
                              <p className="text-[10px] opacity-70 mt-0.5">
                                Click to compact now.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                      {!isStreaming && (
                        <kbd className="hidden lg:inline text-[10px] text-muted-foreground/60 font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border/40">
                          ⌘↩
                        </kbd>
                      )}
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
              );
            })()}
          </div>
        </div>}
      </div>}
      </div>{/* end splitContainerRef */}
    </div>

    {/* ── Model picker portal (escapes composer's overflow-hidden) ── */}
    {showModelPicker && modelPickerRect && typeof window !== 'undefined' && createPortal(
      <div
        ref={modelPickerPanelRef}
        className="fixed z-[300] rounded-xl border border-border bg-card shadow-2xl overflow-hidden min-w-[220px]"
        style={{
          left: modelPickerRect.left,
          // anchor to bottom of viewport above the trigger, with 8px gap
          bottom: window.innerHeight - modelPickerRect.top + 8,
        }}
      >
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/50 font-medium uppercase tracking-wide">
          Model
        </div>
        {MODEL_OPTIONS.map(opt => (
          <button
            key={opt.value || 'default'}
            onClick={() => { setSelectedModel(opt.value); setShowModelPicker(false); }}
            className={cn(
              'w-full text-left px-3 py-2 transition-colors',
              selectedModel === opt.value ? 'bg-primary/10' : 'hover:bg-muted/40'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{opt.label}</span>
              {selectedModel === opt.value && <span className="text-[10px] text-primary">✓</span>}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{opt.hint}</p>
          </button>
        ))}
      </div>,
      document.body
    )}

    {/* ── "Add to Chat" pill on Monaco text selection (portaled) ── */}
    {selectionPopover && typeof window !== 'undefined' && createPortal(
      <button
        onClick={addSelectionToChat}
        onMouseDown={(e) => e.preventDefault()}  // don't steal editor focus → don't trigger blur-clear before click fires
        className="fixed z-[300] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-all border border-primary/30"
        style={{
          top: selectionPopover.top,
          left: selectionPopover.left,
          animation: 'fadeInUp 120ms ease-out',
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add to Chat
        <span className="text-[10px] opacity-70 ml-1 font-mono">
          {selectionPopover.startLine === selectionPopover.endLine
            ? `L${selectionPopover.startLine}`
            : `L${selectionPopover.startLine}-${selectionPopover.endLine}`}
        </span>
      </button>,
      document.body
    )}

    {/* ── Tab context menu (right-click on editor tab) — portaled to escape stacking contexts ── */}
    <TabContextMenuPortal
      ctx={tabContextMenu}
      openTabs={openTabs}
      editedBuffers={editedBuffers}
      effectiveDir={effectiveDir}
      onClose={() => setTabContextMenu(null)}
      onCloseTab={closeTab}
      onCloseOthers={closeOtherTabs}
      onCloseRight={closeTabsToRight}
      onCloseSaved={closeSavedTabs}
      onCloseAll={closeAllTabs}
      onMentionFile={insertFileMention}
      onMoveTab={moveTab}
      onRevealInTree={(path: string) => {
        if (!effectiveDir || !path.startsWith(effectiveDir + '/')) return;
        const parts = path.slice(effectiveDir.length + 1).split('/');
        let acc = effectiveDir;
        const toExpand: string[] = [];
        for (let i = 0; i < parts.length - 1; i++) {
          acc = `${acc}/${parts[i]}`;
          toExpand.push(acc);
        }
        if (toExpand.length) {
          setExpandedDirs(prev => {
            const next = new Set(prev);
            for (const d of toExpand) next.add(d);
            return next;
          });
        }
      }}
      onOpenPreview={openPreviewMode}
      onFormat={formatFileContent}
    />


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

        {/* File-only actions */}
        {contextMenu.entry.type === 'file' && (
          <>
            <button
              onClick={() => { downloadFile(contextMenu.entry.path, contextMenu.entry.name); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-muted/60 transition-colors text-left">
              <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              Download file
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
