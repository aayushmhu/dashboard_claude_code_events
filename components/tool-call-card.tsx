'use client';

import { useState, useCallback } from 'react';
import {
  File, Eye, Terminal, FolderSearch, Search, Bot, Slash,
  PlusCircle, RefreshCw, ListChecks, Wrench, Pencil,
  ChevronDown, ChevronRight, Check, X, Copy,
  Mail, HelpCircle, UsersRound, ClipboardCheck, Globe, Activity, CircleStop, BookOpen,
  Bell, Clock,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { TOOL_COLORS, getAgentColor } from '@/lib/colors';
import { getFileName, getLanguageLabel, formatDurationMs, formatAgentName, formatRelativeTime } from '@/lib/utils';

interface ToolCallCardProps {
  toolName: string;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  isError: boolean;
  errorMessage: string | null;
  timestamp: string;
  /** Optional callback when the user picks an option on an interactive tool (currently AskUserQuestion only). */
  onAnswerQuestion?: (answer: string) => void;
}

interface ToolProps {
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  isError: boolean;
  errorMessage: string | null;
  onAnswerQuestion?: (answer: string) => void;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: `${color}22`, color, border: `1px solid ${color}40` }}
    >
      {children}
    </span>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  let display: string;
  if (typeof data === 'string') {
    display = data.length > 2000 ? data.slice(0, 2000) + '\n…(truncated)' : data;
  } else {
    const str = JSON.stringify(data, null, 2);
    display = str.length > 4000 ? str.slice(0, 4000) + '\n…(truncated)' : str;
  }
  return (
    <pre
      className="overflow-x-auto rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
      style={{ background: '#1a1a1a', color: '#d4d4d4' }}
    >
      {display}
    </pre>
  );
}

function DiffView({ patch }: { patch: string }) {
  const raw = typeof patch === 'string' ? patch : JSON.stringify(patch, null, 2);
  const [copied, setCopied] = useState(false);
  const copyPatch = useCallback(() => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(raw);
    } else {
      const el = document.createElement('textarea');
      el.value = raw;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [raw]);
  const lines = raw.split('\n');

  let oldLine = 1;
  let newLine = 1;

  const rows = lines.map((line, i) => {
    let bg = 'transparent';
    let color = '#c8c8c8';
    let oldNum: number | null = null;
    let newNum: number | null = null;

    if (line.startsWith('---') || line.startsWith('+++')) {
      color = '#94a3b8';
    } else if (line.startsWith('@@')) {
      bg = 'rgba(59,130,246,0.18)';
      color = '#93C5FD';
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldLine = parseInt(m[1]); newLine = parseInt(m[2]); }
    } else if (line.startsWith('+')) {
      bg = 'rgba(16,185,129,0.18)';
      color = '#86EFAC';
      newNum = newLine++;
    } else if (line.startsWith('-')) {
      bg = 'rgba(239,68,68,0.18)';
      color = '#FCA5A5';
      oldNum = oldLine++;
    } else if (line.startsWith(' ')) {
      oldNum = oldLine++;
      newNum = newLine++;
    }

    return (
      <tr key={i} style={{ background: bg }}>
        <td className="select-none text-right pr-2 pl-3 align-top" style={{ color: '#4b5563', minWidth: '32px', width: '1%', whiteSpace: 'nowrap' }}>
          {oldNum ?? ''}
        </td>
        <td className="select-none text-right pr-3 align-top" style={{ color: '#4b5563', minWidth: '32px', width: '1%', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {newNum ?? ''}
        </td>
        <td className="pl-3 pr-3 align-top" style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {line || ' '}
        </td>
      </tr>
    );
  });

  return (
    <div className="rounded-md overflow-hidden text-[11px] font-mono leading-5" style={{ background: '#1a1a1a' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#111', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[10px] text-muted-foreground/50">patch</span>
        <button
          onClick={copyPatch}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="Copy patch"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  );
}

// Build a unified-diff string from old/new text using LCS on lines.
function lineDiff(oldStr: string, newStr: string): string {
  const o = oldStr.split('\n');
  const n = newStr.split('\n');
  const m = o.length, k = n.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= k; j++)
      dp[i][j] = o[i - 1] === n[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack
  const out: string[] = [];
  let i = m, j = k;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && o[i - 1] === n[j - 1]) {
      out.unshift(` ${o[i - 1]}`);
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      out.unshift(`+${n[j - 1]}`);
      j--;
    } else {
      out.unshift(`-${o[i - 1]}`);
      i--;
    }
  }
  return out.join('\n');
}

// Show a new file's content as all-added lines.
function newFileDiff(content: string): string {
  return content.split('\n').map(l => `+${l}`).join('\n');
}

function CodeBlock({ content, filePath }: { content: string; filePath?: string }) {
  const lines = content.split('\n');
  const lang = filePath ? getLanguageLabel(filePath) : 'Text';
  return (
    <div className="rounded-md overflow-hidden">
      {filePath && (
        <div
          className="flex items-center justify-between px-3 py-1 text-[10px]"
          style={{ background: '#111' }}
        >
          <span className="text-muted-foreground font-mono truncate">{getFileName(filePath)}</span>
          <span className="text-muted-foreground ml-2 flex-shrink-0">{lang} · {lines.length} lines</span>
        </div>
      )}
      <div className="overflow-x-auto overflow-y-auto" style={{ background: '#1a1a1a', maxHeight: '280px' }}>
        <table className="border-collapse w-full" style={{ fontSize: '11px', fontFamily: 'ui-monospace, monospace' }}>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td
                  className="select-none text-right pr-3 pl-2 align-top"
                  style={{ color: 'rgba(148,163,184,0.45)', width: '42px', minWidth: '42px' }}
                >
                  {i + 1}
                </td>
                <td style={{ color: '#d4d4d4', paddingRight: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', verticalAlign: 'top' }}>
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TerminalBlock({ text, isError }: { text: string; isError?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const MAX = 30;
  const lines = (text || '').split('\n');
  const visible = showAll || lines.length <= MAX ? lines : lines.slice(0, MAX);
  const hidden = lines.length - MAX;
  return (
    <div>
      <pre
        style={{
          background: isError ? 'rgba(239,68,68,0.06)' : 'rgb(15,15,15)',
          color: isError ? '#FCA5A5' : 'rgb(200,200,200)',
          borderLeft: isError ? '3px solid #EF4444' : undefined,
          fontFamily: "'Consolas','Monaco','Courier New',monospace",
          fontSize: '12px',
          lineHeight: 1.6,
          padding: '12px 16px',
          borderRadius: isError ? '0 8px 8px 0' : '8px',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
        }}
      >
        {visible.join('\n') || ' '}
      </pre>
      {!showAll && hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-1 ml-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Show {hidden} more lines…
        </button>
      )}
    </div>
  );
}

// ─── Shared card shells ───────────────────────────────────────────────────────

function ToolShell({
  color, isError, errorMessage, children,
}: {
  color: string; isError: boolean; errorMessage: string | null; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg overflow-hidden text-sm"
      style={{
        background: 'hsl(var(--card))',
        border: `1px solid ${isError ? 'rgba(239,68,68,0.30)' : 'hsl(var(--border))'}`,
        borderLeft: isError ? '3px solid #EF4444' : `3px solid ${color}`,
      }}
    >
      {children}
      {isError && errorMessage && (
        <div className="px-3 pb-3">
          <p
            className="text-xs rounded p-2 font-mono"
            style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
          >
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

function CollapsibleHeader({
  icon: Icon, color, title, extra, open, onToggle,
}: {
  icon: React.ElementType; color: string; title: React.ReactNode;
  extra?: React.ReactNode; open: boolean; onToggle: () => void;
}) {
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 cursor-pointer select-none hover:bg-muted/40 transition-colors"
      onClick={onToggle}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color }} />
      <div className="flex-1 min-w-0">{title}</div>
      {extra && <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">{extra}</div>}
      {open
        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
    </div>
  );
}

function StaticHeader({
  icon: Icon, color, title, extra,
}: {
  icon: React.ElementType; color: string; title: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">{title}</div>
      {extra && <div className="flex items-center gap-1.5 flex-shrink-0">{extra}</div>}
    </div>
  );
}

// ─── Write ────────────────────────────────────────────────────────────────────

function WriteTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.Write;
  const filePath = (input?.file_path as string) || '';
  const type = (output?.type as string) || 'create';
  const rawPatch = output?.structuredPatch;
  const patch = typeof rawPatch === 'string' ? rawPatch : undefined;
  const content = (input?.content as string) || '';

  const badge = type === 'create'
    ? <Badge color="#10B981">Created</Badge>
    : <Badge color="#F59E0B">Updated</Badge>;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={File}
        color={color}
        title={<span className="text-xs font-mono text-foreground truncate">{getFileName(filePath)}</span>}
        extra={badge}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3">
          {patch
            ? <DiffView patch={patch} />
            : content
            ? <DiffView patch={newFileDiff(content)} />
            : <span className="text-xs text-muted-foreground">No content preview</span>}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

function EditTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.Edit;
  const filePath = (input?.file_path as string) || (output?.filePath as string) || '';
  const rawPatch = output?.structuredPatch;
  const patch = typeof rawPatch === 'string' ? rawPatch : '';
  const oldStr = (input?.old_string as string) || '';
  const newStr = (input?.new_string as string) || '';

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Pencil}
        color={color}
        title={<span className="text-xs font-mono text-foreground truncate">{getFileName(filePath)}</span>}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3">
          {patch
            ? <DiffView patch={patch} />
            : (oldStr || newStr)
            ? <DiffView patch={lineDiff(oldStr, newStr)} />
            : <span className="text-xs text-muted-foreground">No diff available</span>}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function ReadTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.Read;
  const filePath = (input?.file_path as string) || '';
  const file = output?.file as { content?: string } | undefined;
  const content = file?.content || (output?.content as string) || '';
  const lineCount = content ? content.split('\n').length : 0;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Eye}
        color={color}
        title={<span className="text-xs font-mono text-foreground truncate">{getFileName(filePath)}</span>}
        extra={lineCount > 0 ? <Badge color={color}>{lineCount} lines</Badge> : undefined}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3">
          {content
            ? <CodeBlock content={content} filePath={filePath} />
            : <span className="text-xs text-muted-foreground">No content</span>}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Bash ─────────────────────────────────────────────────────────────────────

function BashTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.Bash;
  const cmd = (input?.command as string) || '';
  const desc = input?.description as string | undefined;
  const stdout = (output?.stdout as string) || '';
  const stderr = (output?.stderr as string) || '';
  const interrupted = output?.interrupted as boolean | undefined;
  const noOutputExpected = output?.noOutputExpected as boolean | undefined;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Terminal}
        color={color}
        title={
          <div className="min-w-0">
            <span
              className="text-xs font-mono text-foreground/90 break-all"
              style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}
            >{cmd}</span>
            {desc && <span className="text-[10px] text-muted-foreground">{desc}</span>}
          </div>
        }
        extra={interrupted ? <Badge color="#F59E0B">Interrupted</Badge> : undefined}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {stdout ? (
            <TerminalBlock text={stdout} />
          ) : noOutputExpected ? (
            <p className="text-xs text-muted-foreground italic">No output</p>
          ) : (
            !stderr && <p className="text-xs text-muted-foreground italic">No output</p>
          )}
          {stderr && <TerminalBlock text={stderr} isError />}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Glob ─────────────────────────────────────────────────────────────────────

function GlobTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.Glob;
  const pattern = (input?.pattern as string) || '';
  const basePath = input?.path as string | undefined;
  const filenames = (output?.filenames as string[]) || [];
  const numFiles = (output?.numFiles as number) ?? filenames.length;
  const truncated = output?.truncated as boolean | undefined;
  const durationMs = output?.durationMs as number | undefined;

  const MAX_SHOW = 20;
  const shown = filenames.slice(0, MAX_SHOW);
  const moreCount = filenames.length - MAX_SHOW;

  const stripBase = (p: string) => {
    if (basePath && p.startsWith(basePath)) return p.slice(basePath.length).replace(/^\//, '');
    return p;
  };

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={FolderSearch}
        color={color}
        title={<span className="text-xs font-mono text-foreground">{pattern}</span>}
        extra={<Badge color={color}>{numFiles} files</Badge>}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3">
          {shown.length > 0 ? (
            <div className="space-y-0.5">
              {shown.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px] font-mono text-foreground/80 py-0.5">
                  <File className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{stripBase(f)}</span>
                </div>
              ))}
              {(moreCount > 0 || truncated) && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {truncated ? '…list truncated' : `and ${moreCount} more…`}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No files found</p>
          )}
          {durationMs !== undefined && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {numFiles} files · {formatDurationMs(durationMs)}
            </p>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Grep ─────────────────────────────────────────────────────────────────────

function GrepTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.Grep;
  const pattern = (input?.pattern as string) || '';
  const rawGrep = output?.content;
  const content = typeof rawGrep === 'string' ? rawGrep
    : rawGrep ? JSON.stringify(rawGrep, null, 2) : '';
  const numFiles = output?.numFiles as number | undefined;
  const filenames = output?.filenames as string[] | undefined;
  const mode = (output?.mode as string) || 'content';

  const lines = content ? content.split('\n').filter(Boolean) : [];

  const highlightPattern = (text: string) => {
    if (!pattern || !text) return <>{text}</>;
    try {
      const idx = text.toLowerCase().indexOf(pattern.toLowerCase());
      if (idx === -1) return <>{text}</>;
      return (
        <>
          {text.slice(0, idx)}
          <mark style={{ background: 'rgba(251,191,36,0.35)', color: '#FDE68A', padding: '0 1px', borderRadius: '2px' }}>
            {text.slice(idx, idx + pattern.length)}
          </mark>
          {text.slice(idx + pattern.length)}
        </>
      );
    } catch {
      return <>{text}</>;
    }
  };

  const renderBody = () => {
    if (mode === 'files_with_matches' && filenames) {
      return (
        <div className="space-y-0.5">
          {filenames.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] font-mono text-foreground/80 py-0.5">
              <File className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      );
    }
    if (!lines.length) return <p className="text-xs text-muted-foreground italic">No matches</p>;
    return (
      <div className="rounded-md overflow-hidden overflow-y-auto" style={{ background: '#1a1a1a', maxHeight: '300px' }}>
        {lines.map((line, i) => {
          const colonIdx = line.indexOf(':');
          const lineNum = colonIdx > -1 ? line.slice(0, colonIdx) : '';
          const rest = colonIdx > -1 ? line.slice(colonIdx + 1) : line;
          return (
            <div key={i} className="flex text-[11px] font-mono hover:bg-white/[0.06]">
              <span
                className="select-none text-right flex-shrink-0 pl-2 pr-3 py-0.5"
                style={{ color: 'rgba(148,163,184,0.5)', width: '42px', minWidth: '42px' }}
              >
                {lineNum}
              </span>
              <span
                className="py-0.5 pr-3 flex-1"
                style={{ color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {highlightPattern(rest)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Search}
        color={color}
        title={<span className="text-xs font-mono text-foreground">{pattern}</span>}
        extra={numFiles !== undefined ? <Badge color={color}>{numFiles} {numFiles === 1 ? 'file' : 'files'}</Badge> : undefined}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3">
          {renderBody()}
          {lines.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {lines.length} matches{numFiles !== undefined ? ` in ${numFiles} files` : ''}
            </p>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Agent ────────────────────────────────────────────────────────────────────

function AgentTool({ input, output, isError, errorMessage }: ToolProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  const name = (output?.name as string) || (input?.name as string) || 'Agent';
  const colorHint = output?.color as string | undefined;
  const agentColor = getAgentColor(name, colorHint);
  const displayName = formatAgentName(name);
  const model = (output?.model as string) || (input?.model as string);
  const status = (output?.status as string) || (isError ? 'error' : output ? 'completed' : undefined);
  const prompt = (input?.prompt as string) || '';
  const promptLines = prompt.split('\n');
  const promptPreview = promptLines.slice(0, 3).join('\n');
  const hasMorePrompt = promptLines.length > 3;
  const tokens = output?.totalTokens as number | undefined;
  const durationMs = output?.totalDurationMs as number | undefined;
  const toolCount = output?.totalToolUseCount as number | undefined;

  const statusBadge = status === 'completed'
    ? <Badge color="#10B981">Completed</Badge>
    : status === 'error'
    ? <Badge color="#EF4444">Error</Badge>
    : null;

  return (
    <ToolShell color={agentColor.text} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={Bot}
        color={agentColor.text}
        title={<span className="text-xs font-medium text-foreground">Delegated to {displayName}</span>}
        extra={
          <div className="flex items-center gap-1.5">
            {model && <Badge color={agentColor.text}>{model}</Badge>}
            {statusBadge}
          </div>
        }
      />
      {prompt && (
        <div className="px-3 pb-2 border-t border-white/[0.06]">
          <pre
            className="text-[11px] font-mono whitespace-pre-wrap break-words text-muted-foreground/70 mt-2 overflow-hidden"
            style={{ maxHeight: promptOpen ? undefined : '52px' }}
          >
            {promptOpen ? prompt : promptPreview}
          </pre>
          {hasMorePrompt && (
            <button
              onClick={() => setPromptOpen(v => !v)}
              className="mt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {promptOpen ? 'Collapse prompt' : 'Show full prompt…'}
            </button>
          )}
        </div>
      )}
      {(tokens !== undefined || durationMs !== undefined || toolCount !== undefined) && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-white/[0.06]">
          {tokens !== undefined && (
            <span className="text-[10px] text-muted-foreground">{tokens.toLocaleString()} tokens</span>
          )}
          {durationMs !== undefined && (
            <span className="text-[10px] text-muted-foreground">{formatDurationMs(durationMs)}</span>
          )}
          {toolCount !== undefined && (
            <span className="text-[10px] text-muted-foreground">{toolCount} tool calls</span>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Skill ────────────────────────────────────────────────────────────────────

function SkillTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = TOOL_COLORS.Skill;
  const commandName = (output?.commandName as string) || (input?.skill as string) || '';
  const success = output?.success as boolean | undefined;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={Slash}
        color={color}
        title={<span className="text-xs font-mono text-foreground">/{commandName}</span>}
        extra={
          success === false
            ? <X className="h-3.5 w-3.5 text-red-400" />
            : <Check className="h-3.5 w-3.5 text-emerald-400" />
        }
      />
    </ToolShell>
  );
}

// ─── TaskCreate ───────────────────────────────────────────────────────────────

function TaskCreateTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = '#8B5CF6';
  const task = output?.task as { id?: string | number; subject?: string } | undefined;
  const taskId = task?.id ?? '';
  const subject = task?.subject || (input?.subject as string) || '';
  const desc = input?.description as string | undefined;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={PlusCircle}
        color={color}
        title={
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {taskId !== '' && <Badge color={color}>#{taskId}</Badge>}
              <span className="text-xs text-foreground">{subject}</span>
            </div>
            {desc && <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>}
          </div>
        }
      />
    </ToolShell>
  );
}

// ─── TaskUpdate ───────────────────────────────────────────────────────────────

function TaskUpdateTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = '#8B5CF6';
  const taskId = (output?.taskId ?? input?.taskId) as string | number | undefined;
  const updatedFields = output?.updatedFields as string[] | undefined;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={RefreshCw}
        color={color}
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-foreground">Task #{taskId} updated</span>
            {updatedFields?.map(f => (
              <Badge key={f} color={color}>{f}</Badge>
            ))}
          </div>
        }
      />
    </ToolShell>
  );
}

// ─── TodoWrite ────────────────────────────────────────────────────────────────

function TodoWriteTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = '#14B8A6';
  type TodoItem = { status: string; content: string; activeForm?: string };
  const todos = (output?.newTodos || input?.todos) as TodoItem[] | undefined;
  const total = todos?.length ?? 0;
  const completed = todos?.filter(t => t.status === 'completed').length ?? 0;

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={ListChecks}
        color={color}
        title={<span className="text-xs font-medium text-foreground">Todo list updated</span>}
        extra={<Badge color={color}>{completed}/{total}</Badge>}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && todos && (
        <div className="px-3 pb-3 space-y-1.5">
          {todos.map((todo, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <div
                className="mt-0.5 h-3.5 w-3.5 rounded flex-shrink-0 flex items-center justify-center border"
                style={{
                  borderColor: todo.status === 'completed' ? '#14B8A6' : 'rgba(148,163,184,0.4)',
                  background: todo.status === 'completed' ? 'rgba(20,184,166,0.2)' : 'transparent',
                }}
              >
                {todo.status === 'completed' && <Check className="h-2.5 w-2.5 text-teal-400" />}
              </div>
              <div>
                <span className={todo.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}>
                  {todo.content}
                </span>
                {todo.activeForm && todo.status !== 'completed' && (
                  <p className="text-[10px] text-muted-foreground">{todo.activeForm}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ToolShell>
  );
}

// ─── ToolSearch ───────────────────────────────────────────────────────────────

function ToolSearchTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = '#64748B';
  const query = (input?.query as string) || '';
  const matches = (output?.matches as string[]) || [];

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={Search}
        color={color}
        title={
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Found:</span>
            {matches.map(m => (
              <Badge key={m} color={color}>{m}</Badge>
            ))}
            {matches.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No matches for &quot;{query}&quot;</span>
            )}
          </div>
        }
      />
    </ToolShell>
  );
}

// ─── SendMessage ──────────────────────────────────────────────────────────────

function SendMessageTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.SendMessage;
  const to = (input?.to as string) || '';
  const summary = (input?.summary as string) || (input?.message as string) || '';
  const message = (input?.message as string) || '';
  const routing = output?.routing as Record<string, unknown> | undefined;
  const sender = (routing?.sender as string) || '';
  const target = (routing?.target as string) || to;
  const targetColor = (routing?.targetColor as string) || undefined;
  const agentColor = getAgentColor(to, targetColor);
  const displayTo = formatAgentName(to);

  return (
    <ToolShell color={agentColor.text} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={Mail}
        color={agentColor.text}
        title={
          <span className="text-xs font-medium text-foreground">
            Message to{' '}
            <span style={{ color: agentColor.text }}>{displayTo}</span>
          </span>
        }
      />
      <div className="px-3 pb-3 space-y-2">
        {summary && (
          <p className="text-xs text-foreground/90 leading-relaxed">{summary}</p>
        )}
        {message && message !== summary && (
          <div>
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Full message
            </button>
            {open && (
              <pre className="mt-1 text-[11px] font-mono whitespace-pre-wrap break-words text-muted-foreground/80 rounded p-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
                {message}
              </pre>
            )}
          </div>
        )}
        {(sender || target) && (
          <p className="text-[10px] text-muted-foreground font-mono">
            {sender && `From: ${sender}`}{sender && target ? ' → ' : ''}{target && `To: ${target}`}
          </p>
        )}
      </div>
    </ToolShell>
  );
}

// ─── AskUserQuestion ──────────────────────────────────────────────────────────

type OptionItem = string | { label?: string; description?: string; value?: string; [k: string]: unknown };
type QuestionItem =
  | string
  | { question?: string; header?: string; options?: OptionItem[]; multiSelect?: boolean; [k: string]: unknown };

function optionLabel(opt: OptionItem): string {
  if (typeof opt === 'string') return opt;
  return (opt.label as string) || (opt.value as string) || JSON.stringify(opt);
}

function optionDesc(opt: OptionItem): string | undefined {
  if (typeof opt === 'string') return undefined;
  return opt.description as string | undefined;
}

function renderQuestion(q: QuestionItem): { text: string; header?: string; options?: OptionItem[]; multiSelect?: boolean } {
  if (typeof q === 'string') return { text: q };
  return {
    text: (q.question as string) || (q.header as string) || JSON.stringify(q),
    header: q.header as string | undefined,
    options: q.options as OptionItem[] | undefined,
    multiSelect: q.multiSelect as boolean | undefined,
  };
}

function AskUserQuestionTool({ input, output, isError, errorMessage, onAnswerQuestion }: ToolProps) {
  const [open, setOpen] = useState(true);
  // Per-question, the option the user clicked (so we can dim the others without
  // waiting for the network roundtrip). Resets when a fresh tool call mounts.
  const [picked, setPicked] = useState<Record<number, string>>({});
  const color = TOOL_COLORS.AskUserQuestion;
  const rawQuestions = ((output?.questions ?? input?.questions) as QuestionItem[]) || [];
  const answers: Record<string, string> = ((output?.answers ?? input?.answers) as Record<string, string>) || {};
  const interactive = !!onAnswerQuestion;

  const onPick = (qIdx: number, optLabel: string) => {
    if (!onAnswerQuestion || picked[qIdx]) return;
    setPicked(prev => ({ ...prev, [qIdx]: optLabel }));
    onAnswerQuestion(optLabel);
  };

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={HelpCircle}
        color={color}
        title={<span className="text-xs font-medium text-foreground">User Questions</span>}
        extra={<Badge color={color}>{rawQuestions.length} {rawQuestions.length === 1 ? 'question' : 'questions'}</Badge>}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && rawQuestions.length > 0 && (
        <div className="px-3 pb-3 space-y-3">
          {rawQuestions.map((raw, i) => {
            const q = renderQuestion(raw);
            const choice = picked[i];
            return (
              <div key={i} className={i > 0 ? 'pt-3 border-t border-white/[0.06]' : ''}>
                {q.header && q.header !== q.text && (
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">{q.header}</p>
                )}
                <p className="text-xs font-medium text-foreground/90 leading-relaxed">{q.text}</p>
                {q.options && q.options.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {q.options.map((opt, j) => {
                      const label = optionLabel(opt);
                      const desc = optionDesc(opt);
                      const isPicked = choice === label;
                      const isDimmed = !!choice && !isPicked;
                      const baseStyle = {
                        borderColor: isPicked ? color : `${color}40`,
                        color: isPicked ? '#fff' : color,
                        background: isPicked ? color : `${color}12`,
                      };
                      const content = (
                        <span className="flex items-baseline gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded border font-mono shrink-0 transition-all" style={baseStyle}>
                            {label}
                          </span>
                          {desc && (
                            <span className="text-[10px] text-muted-foreground/70 text-left">{desc}</span>
                          )}
                        </span>
                      );
                      if (interactive) {
                        return (
                          <button
                            key={j}
                            type="button"
                            disabled={!!choice}
                            onClick={() => onPick(i, label)}
                            className={`text-left rounded px-1.5 py-1 -mx-1.5 transition-opacity ${
                              isDimmed ? 'opacity-30' : 'hover:bg-white/[0.04]'
                            } ${choice ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            {content}
                          </button>
                        );
                      }
                      return <div key={j} className="px-1.5 py-1 -mx-1.5">{content}</div>;
                    })}
                    {q.multiSelect && (
                      <span className="text-[9px] text-muted-foreground/50 mt-0.5">multi-select</span>
                    )}
                  </div>
                )}
                {choice && interactive && (
                  <p className="mt-2 text-[10px] text-emerald-400/80">
                    ✓ Sent: <span className="font-mono">{choice}</span>
                  </p>
                )}
                {answers[q.text] && (
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{answers[q.text]}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ToolShell>
  );
}

// ─── WebFetch ─────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function WebFetchTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.WebFetch;
  const url = (input?.url as string) || '';
  const prompt = (input?.prompt as string) || '';
  const code = (output?.code as number) ?? null;
  const codeText = (output?.codeText as string) || '';
  const bytes = (output?.bytes as number) ?? 0;
  const result = (output?.result as string) || '';

  let host = '';
  let path = '';
  try {
    const u = new URL(url);
    host = u.host;
    path = (u.pathname + u.search) || '';
    if (path === '/') path = '';
  } catch {
    host = url;
  }

  const ok = code === 200;
  const statusBadge =
    code !== null
      ? <Badge color={ok ? '#10B981' : '#EF4444'}>{ok ? '200 OK' : `${code}${codeText ? ` ${codeText}` : ''}`}</Badge>
      : undefined;

  const title = (
    <div className="min-w-0 flex items-baseline gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        onClick={e => e.stopPropagation()}
        className="text-xs font-mono text-foreground truncate hover:underline"
        style={{ color }}
      >
        {host}
        {path && <span className="text-muted-foreground/70">{path}</span>}
      </a>
    </div>
  );

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Globe}
        color={color}
        title={title}
        extra={statusBadge}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {prompt && (
        <div className="px-3 -mt-1 pb-2">
          <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">{prompt}</p>
        </div>
      )}
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {result ? (
            <div
              className="rounded-md p-3 text-xs leading-relaxed prose prose-invert prose-sm max-w-none overflow-y-auto"
              style={{ background: 'rgba(0,0,0,0.20)', maxHeight: '360px' }}
            >
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No response body</p>
          )}
          <div className="flex items-center gap-3 pt-1 border-t border-white/[0.06] text-[10px] text-muted-foreground">
            {bytes > 0 && <span>{formatBytes(bytes)}</span>}
            {code !== null && (
              <span>
                HTTP {code}
                {codeText ? ` ${codeText}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}

// ─── WebSearch ────────────────────────────────────────────────────────────────

interface SearchLink { title?: string; url?: string }

function WebSearchTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(true);
  const color = TOOL_COLORS.WebSearch;
  const query = (input?.query as string) || '';
  const allowedDomains = Array.isArray(input?.allowed_domains)
    ? (input!.allowed_domains as string[])
    : [];
  const results = Array.isArray(output?.results) ? (output!.results as unknown[]) : [];
  const duration = typeof output?.durationSeconds === 'number'
    ? (output.durationSeconds as number)
    : undefined;

  const first = results[0] as { content?: SearchLink[] } | undefined;
  const links = Array.isArray(first?.content) ? first!.content : [];
  const summary = typeof results[1] === 'string' ? (results[1] as string) : '';

  const linkColor = '#3B82F6';

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Search}
        color={color}
        title={
          <div className="min-w-0 space-y-1">
            <span className="text-xs font-mono text-foreground block truncate">{query}</span>
            {allowedDomains.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {allowedDomains.map((d) => (
                  <span
                    key={d}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        }
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {links.length > 0 && (
            <div>
              {links.map((link, i) => (
                <div
                  key={i}
                  className={i > 0 ? 'pt-2 mt-2 border-t border-white/[0.06]' : ''}
                >
                  <a
                    href={link.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs hover:underline block truncate"
                    style={{ color: linkColor }}
                  >
                    {link.title || link.url || 'Untitled'}
                  </a>
                  {link.url && (
                    <p className="text-[10px] font-mono text-muted-foreground/60 truncate mt-0.5">
                      {link.url}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {summary && (
            <div
              className="rounded-md p-3 text-xs leading-relaxed prose prose-invert prose-sm max-w-none overflow-y-auto"
              style={{ background: 'rgba(0,0,0,0.20)', maxHeight: '360px' }}
            >
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          )}

          {(links.length > 0 || duration !== undefined) && (
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06] text-[10px] text-muted-foreground">
              {links.length > 0 && (
                <span>{links.length} result{links.length === 1 ? '' : 's'}</span>
              )}
              {links.length > 0 && duration !== undefined && <span>·</span>}
              {duration !== undefined && <span>{duration.toFixed(1)}s</span>}
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Monitor ──────────────────────────────────────────────────────────────────

function extractMonitorOutput(output: Record<string, unknown> | null): string {
  if (output === null || output === undefined) return '';
  if (typeof output === 'string') return output;
  const candidates = ['result', 'output', 'stdout', 'content'] as const;
  for (const k of candidates) {
    const v = output[k];
    if (typeof v === 'string') return v;
  }
  return JSON.stringify(output, null, 2);
}

function MonitorTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(true);
  const color = TOOL_COLORS.Monitor;

  const hasCommand = typeof input?.command === 'string';
  const description = (input?.description as string) || '';
  const command = (input?.command as string) || '';
  const taskId = (input?.taskId as string) || '';
  const persistent = input?.persistent as boolean | undefined;
  const timeoutMs = (input?.timeout_ms ?? input?.timeoutMs) as number | undefined;
  const outputStr = extractMonitorOutput(output);
  const timeoutLabel = typeof timeoutMs === 'number' && timeoutMs > 0
    ? `${Math.round(timeoutMs / 1000)}s timeout`
    : '';

  const title = hasCommand ? (
    <span className="text-xs font-medium text-foreground truncate">
      {description || 'Monitor'}
    </span>
  ) : (
    <span className="text-xs font-medium text-foreground">
      Monitor:{' '}
      <span className="font-mono text-muted-foreground">
        {taskId ? taskId.slice(0, 8) : '—'}
      </span>
    </span>
  );

  const extras = (
    <>
      {persistent !== undefined && (
        <Badge color={persistent ? '#10B981' : '#64748B'}>
          {persistent ? 'persistent' : 'one-shot'}
        </Badge>
      )}
      {timeoutLabel && <Badge color={color}>{timeoutLabel}</Badge>}
    </>
  );

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Activity}
        color={color}
        title={title}
        extra={extras}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {hasCommand && command && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Command</p>
              <TerminalBlock text={command} />
            </div>
          )}
          {hasCommand && outputStr && (
            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[10px] text-muted-foreground mb-1">Output</p>
              <TerminalBlock text={outputStr} isError={isError} />
            </div>
          )}
          {!hasCommand && (
            outputStr
              ? <TerminalBlock text={outputStr} isError={isError} />
              : <p className="text-xs text-muted-foreground italic">Waiting for results…</p>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── TaskStop ─────────────────────────────────────────────────────────────────

function TaskStopTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = TOOL_COLORS.TaskStop;
  const taskId = (input?.task_id as string) || (output?.task_id as string) || '';
  const taskType = (output?.task_type as string) || '';
  const command = (output?.command as string) || '';

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-medium text-foreground">Task Stopped</span>
      {taskId && (
        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
          {taskId.slice(0, 8)}
        </span>
      )}
    </div>
  );

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={CircleStop}
        color={color}
        title={title}
        extra={taskType ? <Badge color="#64748B">{taskType}</Badge> : undefined}
      />
      {command && (
        <div className="px-3 pb-3">
          <p
            className="text-[11px] font-mono text-muted-foreground/80 truncate rounded px-2 py-1.5"
            style={{ background: 'rgba(0,0,0,0.20)' }}
            title={command}
          >
            {command}
          </p>
        </div>
      )}
    </ToolShell>
  );
}

// ─── NotebookEdit ─────────────────────────────────────────────────────────────

function NotebookEditTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = TOOL_COLORS.NotebookEdit;
  const notebookPath = (input?.notebook_path as string) || '';
  const cellId = (input?.cell_id as string) || '';
  const editMode = ((input?.edit_mode as string) || 'replace').toLowerCase();
  const cellType = (input?.cell_type as string) || '';
  const newSource = (input?.new_source as string) || '';

  const filename = notebookPath ? (notebookPath.split('/').pop() || notebookPath) : 'notebook';
  const lineCount = newSource ? newSource.split('\n').length : 0;

  const isDelete  = editMode === 'delete';
  const isInsert  = editMode === 'insert';
  const isReplace = editMode === 'replace';
  const useMarkdown = isInsert && cellType === 'markdown';

  // Collapsed by default for big replaces; expanded for inserts. Delete has no body.
  const [open, setOpen] = useState(!isDelete && (isInsert || lineCount <= 10));

  const modeBadge =
    isReplace ? <Badge color="#F59E0B">Replaced</Badge> :
    isInsert  ? <Badge color="#10B981">Inserted</Badge> :
    isDelete  ? <Badge color="#EF4444">Deleted</Badge> :
    <Badge color={color}>{editMode}</Badge>;

  const cellTypeBadge = cellType
    ? <Badge color="#64748B">{cellType}</Badge>
    : undefined;

  const cellIdShort = cellId.length > 14 ? cellId.slice(0, 14) + '…' : cellId;

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-mono text-foreground truncate">{filename}</span>
      {cellId && (
        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
          {cellIdShort}
        </span>
      )}
    </div>
  );

  const extras = (
    <>
      {cellTypeBadge}
      {modeBadge}
    </>
  );

  const footerPath = notebookPath ? (
    <p
      className="text-[10px] font-mono text-muted-foreground/60 truncate"
      title={notebookPath}
    >
      {notebookPath}
    </p>
  ) : null;

  // Delete mode: compact single line, no body, no collapse.
  if (isDelete) {
    return (
      <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
        <StaticHeader icon={BookOpen} color={color} title={title} extra={extras} />
        {footerPath && <div className="px-3 pb-2 pt-0">{footerPath}</div>}
      </ToolShell>
    );
  }

  // Replace / Insert: collapsible body with the new source.
  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={BookOpen}
        color={color}
        title={title}
        extra={extras}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {newSource ? (
            useMarkdown ? (
              <div
                className="rounded-md p-3 text-xs leading-relaxed prose prose-invert prose-sm max-w-none overflow-y-auto"
                style={{ background: 'rgba(0,0,0,0.20)', maxHeight: '360px' }}
              >
                <ReactMarkdown>{newSource}</ReactMarkdown>
              </div>
            ) : (
              <CodeBlock content={newSource} filePath="cell.py" />
            )
          ) : (
            <p className="text-xs text-muted-foreground italic">No source provided</p>
          )}
          {footerPath}
        </div>
      )}
      {!open && footerPath && <div className="px-3 pb-2">{footerPath}</div>}
    </ToolShell>
  );
}

// ─── PushNotification ─────────────────────────────────────────────────────────

const PUSH_REASON_LABELS: Record<string, string> = {
  bridge_inactive: 'Remote bridge not connected',
  bridge_failed:   'Remote bridge failed',
  not_authorized:  'Notification permission denied',
  rate_limited:    'Rate limited',
};

function PushNotificationTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = TOOL_COLORS.PushNotification;
  const message = (input?.message as string) || (output?.message as string) || '';
  const status = (input?.status as string) || '';
  const pushSent = output?.pushSent as boolean | undefined;
  const localSent = output?.localSent as boolean | undefined;
  const disabledReason = (output?.disabledReason as string) || '';
  const sentAt = (output?.sentAt as string) || '';

  const reasonText = (localSent === false && disabledReason)
    ? PUSH_REASON_LABELS[disabledReason] ?? disabledReason.replace(/_/g, ' ')
    : '';

  const extras = (
    <>
      {pushSent === true && <Badge color="#10B981">Sent</Badge>}
      {pushSent === false && <Badge color="#F59E0B">Not sent</Badge>}
      {localSent === true && <Badge color="#10B981">Local</Badge>}
      {status && <Badge color="#64748B">{status}</Badge>}
    </>
  );

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={Bell}
        color={color}
        title={<span className="text-xs font-medium text-foreground">Push Notification</span>}
        extra={extras}
      />
      <div className="px-3 pb-3 space-y-1.5">
        {message && (
          <p className="text-sm text-foreground/90 leading-relaxed">{message}</p>
        )}
        {reasonText && (
          <p className="text-[11px] text-red-400/80">{reasonText}</p>
        )}
        {sentAt && (
          <p className="text-[10px] text-muted-foreground/60">
            {formatRelativeTime(sentAt)}
          </p>
        )}
      </div>
    </ToolShell>
  );
}

// ─── CronCreate ───────────────────────────────────────────────────────────────

function CronCreateTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = TOOL_COLORS.CronCreate;
  const cronExpr = (input?.cron as string) || (output?.cron as string) || '';
  const humanSchedule = (output?.humanSchedule as string) || '';
  const id = (output?.id as string) || '';
  const recurring = (output?.recurring ?? input?.recurring) as boolean | undefined;
  const durable = output?.durable as boolean | undefined;
  const prompt = (input?.prompt as string) || '';

  const idShort = id ? (id.length > 10 ? id.slice(0, 10) : id) : '';
  // humanSchedule is sometimes just an echo of the cron expression. Only show
  // it as the primary line when it actually parses to something more readable.
  const distinctHuman = humanSchedule && humanSchedule.trim() && humanSchedule !== cronExpr;

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-medium text-foreground">Cron Job Created</span>
      {idShort && (
        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
          {idShort}
        </span>
      )}
    </div>
  );

  const extras = (
    <>
      {recurring === true && <Badge color="#3B82F6">Recurring</Badge>}
      {recurring === false && <Badge color="#64748B">One-time</Badge>}
      {durable === true && <Badge color="#10B981">Durable</Badge>}
    </>
  );

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader icon={Clock} color={color} title={title} extra={extras} />
      <div className="px-3 pb-3 space-y-2">
        <div className="flex flex-col gap-0.5">
          {distinctHuman && (
            <p className="text-xs text-foreground/90">{humanSchedule}</p>
          )}
          {cronExpr && (
            <p className={`font-mono ${distinctHuman ? 'text-[10px] text-muted-foreground/70' : 'text-xs text-foreground/90'}`}>
              {cronExpr}
            </p>
          )}
        </div>
        {prompt && (
          <p
            className="text-[11px] text-muted-foreground/80 leading-snug"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
            title={prompt}
          >
            {prompt}
          </p>
        )}
      </div>
    </ToolShell>
  );
}

// ─── TeamCreate ───────────────────────────────────────────────────────────────

function TeamCreateTool({ input, output, isError, errorMessage }: ToolProps) {
  const color = TOOL_COLORS.TeamCreate;
  const teamName = (output?.team_name ?? input?.team_name) as string || '';
  const agentType = (input?.agent_type as string) || '';
  const description = (input?.description as string) || '';
  const configPath = (output?.team_file_path as string) || '';

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <StaticHeader
        icon={UsersRound}
        color={color}
        title={<span className="text-xs font-medium text-foreground">Team Created: {teamName}</span>}
      />
      <div className="px-3 pb-3 space-y-2">
        {description && <p className="text-xs text-muted-foreground/80 leading-relaxed">{description}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          {agentType && <Badge color={color}>Lead: {agentType}</Badge>}
        </div>
        {configPath && (
          <p className="text-[10px] font-mono text-muted-foreground/60 truncate">{configPath}</p>
        )}
      </div>
    </ToolShell>
  );
}

// ─── TaskOutput ───────────────────────────────────────────────────────────────

function TaskOutputTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS.TaskOutput;
  const taskId = (input?.task_id as string) || '';
  const block = input?.block as boolean | undefined;
  const timeout = input?.timeout as number | undefined;

  const task = output?.task as Record<string, unknown> | undefined;
  const retrievalStatus = (output?.retrieval_status as string) || '';

  const statusColor = retrievalStatus === 'retrieved' ? '#10B981'
    : retrievalStatus === 'pending'  ? '#F59E0B'
    : retrievalStatus === 'failed'   ? '#EF4444'
    : '#64748B';

  let preview: string | null = null;
  if (task?.output) {
    try {
      const parsed = JSON.parse(task.output as string);
      const raw = parsed?.message?.content ?? parsed?.content ?? parsed?.result;
      if (typeof raw === 'string') {
        preview = raw.slice(0, 200);
      } else if (Array.isArray(raw)) {
        const txt = raw.find((b: unknown) => (b as Record<string, unknown>)?.type === 'text');
        if (txt) preview = String((txt as Record<string, unknown>).text ?? '').slice(0, 200);
      }
    } catch { /* raw data — not user-facing */ }
  }

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={ClipboardCheck}
        color={color}
        title={
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-foreground">Task Output</span>
            {taskId && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                {taskId.slice(0, 8)}
              </span>
            )}
          </div>
        }
        extra={retrievalStatus ? <Badge color={statusColor}>{retrievalStatus}</Badge> : undefined}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {preview !== null ? (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Preview</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap break-words">
                {preview}{preview.length >= 200 ? '…' : ''}
              </p>
            </div>
          ) : task?.output ? (
            <p className="text-xs text-muted-foreground italic">Task data available</p>
          ) : null}
          {(block !== undefined || timeout !== undefined) && (
            <div className="flex items-center gap-3 pt-1 border-t border-white/[0.06]">
              {block !== undefined && (
                <span className="text-[10px] text-muted-foreground">block: {String(block)}</span>
              )}
              {timeout !== undefined && (
                <span className="text-[10px] text-muted-foreground">timeout: {timeout}ms</span>
              )}
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function FallbackTool({
  toolName, input, output, isError, errorMessage,
}: ToolProps & { toolName: string }) {
  const [open, setOpen] = useState(false);
  const color = TOOL_COLORS[toolName] || '#64748B';

  return (
    <ToolShell color={color} isError={isError} errorMessage={errorMessage}>
      <CollapsibleHeader
        icon={Wrench}
        color={color}
        title={<span className="text-xs font-medium text-foreground">{toolName}</span>}
        open={open}
        onToggle={() => setOpen(v => !v)}
      />
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {input && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Input</p>
              <JsonBlock data={input} />
            </div>
          )}
          {output && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Output</p>
              <JsonBlock data={output} />
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ToolCallCard({
  toolName, toolInput, toolOutput, isError, errorMessage, onAnswerQuestion,
}: ToolCallCardProps) {
  const props: ToolProps = { input: toolInput, output: toolOutput, isError, errorMessage, onAnswerQuestion };

  switch (toolName) {
    case 'Write':      return <WriteTool {...props} />;
    case 'Edit':       return <EditTool {...props} />;
    case 'Read':       return <ReadTool {...props} />;
    case 'Bash':       return <BashTool {...props} />;
    case 'Glob':       return <GlobTool {...props} />;
    case 'Grep':       return <GrepTool {...props} />;
    case 'Agent':      return <AgentTool {...props} />;
    case 'Skill':      return <SkillTool {...props} />;
    case 'TaskCreate':  return <TaskCreateTool  {...props} />;
    case 'TaskUpdate':  return <TaskUpdateTool  {...props} />;
    case 'TaskOutput':  return <TaskOutputTool  {...props} />;
    case 'TodoWrite':  return <TodoWriteTool {...props} />;
    case 'ToolSearch':      return <ToolSearchTool {...props} />;
    case 'SendMessage':     return <SendMessageTool {...props} />;
    case 'AskUserQuestion': return <AskUserQuestionTool {...props} />;
    case 'WebFetch':        return <WebFetchTool {...props} />;
    case 'WebSearch':       return <WebSearchTool {...props} />;
    case 'Monitor':         return <MonitorTool {...props} />;
    case 'TaskStop':        return <TaskStopTool {...props} />;
    case 'NotebookEdit':    return <NotebookEditTool {...props} />;
    case 'PushNotification': return <PushNotificationTool {...props} />;
    case 'CronCreate':      return <CronCreateTool {...props} />;
    case 'TeamCreate':      return <TeamCreateTool {...props} />;
    default:                return <FallbackTool toolName={toolName} {...props} />;
  }
}
