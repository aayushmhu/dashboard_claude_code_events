'use client';

import { useState } from 'react';
import {
  File, Eye, Terminal, FolderSearch, Search, Bot, Slash,
  PlusCircle, RefreshCw, ListChecks, Wrench, Pencil,
  ChevronDown, ChevronRight, Check, X,
  Mail, HelpCircle, UsersRound,
} from 'lucide-react';
import { TOOL_COLORS, getAgentColor } from '@/lib/colors';
import { getFileName, getLanguageLabel, formatDurationMs, formatAgentName } from '@/lib/utils';

interface ToolCallCardProps {
  toolName: string;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  isError: boolean;
  errorMessage: string | null;
  timestamp: string;
}

interface ToolProps {
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  isError: boolean;
  errorMessage: string | null;
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
  const lines = (typeof patch === 'string' ? patch : JSON.stringify(patch, null, 2)).split('\n');
  return (
    <div className="rounded-md overflow-hidden text-[11px] font-mono leading-5" style={{ background: '#1a1a1a' }}>
      {lines.map((line, i) => {
        let bg = 'transparent';
        let color = '#c8c8c8';
        if (line.startsWith('+++') || line.startsWith('---')) {
          color = '#94a3b8';
        } else if (line.startsWith('@@')) {
          bg = 'rgba(59,130,246,0.22)';
          color = '#93C5FD';
        } else if (line.startsWith('+')) {
          bg = 'rgba(16,185,129,0.20)';
          color = '#86EFAC';
        } else if (line.startsWith('-')) {
          bg = 'rgba(239,68,68,0.20)';
          color = '#FCA5A5';
        }
        return (
          <div key={i} style={{ background: bg, color, padding: '0 12px', minHeight: '20px' }}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
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
      className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-muted/40 transition-colors"
      onClick={onToggle}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">{title}</div>
      {extra && <div className="flex items-center gap-1.5 flex-shrink-0">{extra}</div>}
      {open
        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
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
            ? <CodeBlock content={content} filePath={filePath} />
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
          {patch ? (
            <DiffView patch={patch} />
          ) : (
            <div className="space-y-2">
              {oldStr && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Removed</p>
                  <pre
                    className="text-[11px] font-mono p-2 rounded whitespace-pre-wrap break-words max-h-[160px] overflow-y-auto"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}
                  >{oldStr}</pre>
                </div>
              )}
              {newStr && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Added</p>
                  <pre
                    className="text-[11px] font-mono p-2 rounded whitespace-pre-wrap break-words max-h-[160px] overflow-y-auto"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#86EFAC' }}
                  >{newStr}</pre>
                </div>
              )}
            </div>
          )}
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
            <span className="text-xs font-mono text-foreground/90 block truncate">{cmd}</span>
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

function AskUserQuestionTool({ input, output, isError, errorMessage }: ToolProps) {
  const [open, setOpen] = useState(true);
  const color = TOOL_COLORS.AskUserQuestion;
  const rawQuestions = ((output?.questions ?? input?.questions) as QuestionItem[]) || [];
  const answers: Record<string, string> = ((output?.answers ?? input?.answers) as Record<string, string>) || {};

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
            return (
              <div key={i} className={i > 0 ? 'pt-3 border-t border-white/[0.06]' : ''}>
                {q.header && q.header !== q.text && (
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">{q.header}</p>
                )}
                <p className="text-xs font-medium text-foreground/90 leading-relaxed">{q.text}</p>
                {q.options && q.options.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {q.options.map((opt, j) => (
                      <div key={j} className="flex items-baseline gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded border font-mono shrink-0"
                          style={{ borderColor: `${color}40`, color, background: `${color}12` }}>
                          {optionLabel(opt)}
                        </span>
                        {optionDesc(opt) && (
                          <span className="text-[10px] text-muted-foreground/70">{optionDesc(opt)}</span>
                        )}
                      </div>
                    ))}
                    {q.multiSelect && (
                      <span className="text-[9px] text-muted-foreground/50 mt-0.5">multi-select</span>
                    )}
                  </div>
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
  toolName, toolInput, toolOutput, isError, errorMessage,
}: ToolCallCardProps) {
  const props: ToolProps = { input: toolInput, output: toolOutput, isError, errorMessage };

  switch (toolName) {
    case 'Write':      return <WriteTool {...props} />;
    case 'Edit':       return <EditTool {...props} />;
    case 'Read':       return <ReadTool {...props} />;
    case 'Bash':       return <BashTool {...props} />;
    case 'Glob':       return <GlobTool {...props} />;
    case 'Grep':       return <GrepTool {...props} />;
    case 'Agent':      return <AgentTool {...props} />;
    case 'Skill':      return <SkillTool {...props} />;
    case 'TaskCreate': return <TaskCreateTool {...props} />;
    case 'TaskUpdate': return <TaskUpdateTool {...props} />;
    case 'TodoWrite':  return <TodoWriteTool {...props} />;
    case 'ToolSearch':      return <ToolSearchTool {...props} />;
    case 'SendMessage':     return <SendMessageTool {...props} />;
    case 'AskUserQuestion': return <AskUserQuestionTool {...props} />;
    case 'TeamCreate':      return <TeamCreateTool {...props} />;
    default:                return <FallbackTool toolName={toolName} {...props} />;
  }
}
