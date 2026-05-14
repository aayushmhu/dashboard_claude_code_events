'use client';

import { Fragment, useMemo, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Pencil, Check, Trash2, ChevronUp, ChevronDown, ArrowLeftRight, Plus } from 'lucide-react';
import { uuid } from '@/lib/utils';

// Minimal .ipynb v4 types. We only read fields we render; everything else is
// passed through `unknown` so a malformed notebook doesn't crash the editor.
interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  outputs?: NotebookOutput[];
  execution_count?: number | null;
  id?: string;
  metadata?: Record<string, unknown>;
}

type NotebookOutput =
  | { output_type: 'stream'; name?: string; text: string | string[] }
  | { output_type: 'execute_result' | 'display_data'; data?: Record<string, string | string[]>; execution_count?: number }
  | { output_type: 'error'; ename?: string; evalue?: string; traceback?: string[] }
  | { output_type: string; [k: string]: unknown };

interface Notebook {
  cells?: NotebookCell[];
  metadata?: {
    kernelspec?: { display_name?: string; name?: string };
    language_info?: { name?: string };
  };
  nbformat?: number;
  nbformat_minor?: number;
}

function asString(source: string | string[] | undefined): string {
  if (!source) return '';
  return Array.isArray(source) ? source.join('') : source;
}

// Strip ANSI escape sequences (common in error tracebacks).
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

// .ipynb files use 1-space indentation by Jupyter convention. Match it on
// serialize so saved files diff cleanly against external edits.
function serialize(nb: Notebook): string {
  return JSON.stringify(nb, null, 1);
}

// Auto-grow a textarea to fit its content. Saves us flaky scrollbars on tall cells.
function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

function Output({ output }: { output: NotebookOutput }) {
  if (output.output_type === 'stream') {
    const o = output as { output_type: 'stream'; name?: string; text: string | string[] };
    const isErr = o.name === 'stderr';
    return (
      <pre
        className="text-[12px] leading-[1.55] overflow-x-auto"
        style={{
          background: isErr ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
          color: isErr ? '#FCA5A5' : '#c8c8c8',
          padding: '10px 14px',
          margin: 0,
          borderLeft: isErr ? '3px solid #EF4444' : '3px solid transparent',
          fontFamily: "'Consolas','Monaco','Courier New',monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {stripAnsi(asString(o.text))}
      </pre>
    );
  }

  if (output.output_type === 'error') {
    const o = output as { output_type: 'error'; ename?: string; evalue?: string; traceback?: string[] };
    const tb = (o.traceback || []).map(stripAnsi).join('\n');
    return (
      <pre
        className="text-[12px] leading-[1.55] overflow-x-auto"
        style={{
          background: 'rgba(239,68,68,0.08)',
          color: '#FCA5A5',
          padding: '10px 14px',
          margin: 0,
          borderLeft: '3px solid #EF4444',
          fontFamily: "'Consolas','Monaco','Courier New',monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {tb || `${o.ename ?? 'Error'}: ${o.evalue ?? ''}`}
      </pre>
    );
  }

  if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
    const o = output as { output_type: string; data?: Record<string, string | string[]> };
    const data = o.data || {};
    const png = data['image/png'];
    if (png) {
      const b64 = asString(png).trim();
      return (
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)' }}>
          <img src={`data:image/png;base64,${b64}`} alt="output" style={{ maxWidth: '100%', borderRadius: 4 }} />
        </div>
      );
    }
    const jpeg = data['image/jpeg'];
    if (jpeg) {
      return (
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)' }}>
          <img src={`data:image/jpeg;base64,${asString(jpeg).trim()}`} alt="output" style={{ maxWidth: '100%', borderRadius: 4 }} />
        </div>
      );
    }
    const text = asString(data['text/plain']);
    if (text) {
      return (
        <pre
          className="text-[12px] leading-[1.55] overflow-x-auto"
          style={{
            background: 'rgba(255,255,255,0.02)',
            color: '#c8c8c8',
            padding: '10px 14px',
            margin: 0,
            fontFamily: "'Consolas','Monaco','Courier New',monospace",
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </pre>
      );
    }
    return null;
  }

  return null;
}

function newCell(type: 'code' | 'markdown'): NotebookCell {
  if (type === 'code') {
    return {
      cell_type: 'code',
      source: '',
      id: uuid(),
      metadata: {},
      execution_count: null,
      outputs: [],
    };
  }
  return {
    cell_type: 'markdown',
    source: '',
    id: uuid(),
    metadata: {},
  };
}

function CellToolbar({
  canMoveUp, canMoveDown, onMoveUp, onMoveDown, onConvert, onDelete, convertLabel,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConvert: () => void;
  onDelete: () => void;
  convertLabel: string;
}) {
  const btn = 'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:bg-transparent disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button onClick={onMoveUp}   disabled={!canMoveUp}   title="Move up"     className={btn}><ChevronUp className="h-3 w-3" /></button>
      <button onClick={onMoveDown} disabled={!canMoveDown} title="Move down"   className={btn}><ChevronDown className="h-3 w-3" /></button>
      <button onClick={onConvert}                          title={convertLabel} className={btn}><ArrowLeftRight className="h-3 w-3" /></button>
      <button onClick={onDelete}                           title="Delete cell"  className={`${btn} hover:!text-red-400`}><Trash2 className="h-3 w-3" /></button>
    </div>
  );
}

function AddCellRow({ onAdd }: { onAdd: (type: 'code' | 'markdown') => void }) {
  return (
    <div className="opacity-0 hover:opacity-100 transition-opacity flex items-center gap-2 py-1">
      <div className="flex-1 h-px bg-border/40" />
      <button
        onClick={() => onAdd('code')}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/40 hover:border-border bg-card/40 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Code
      </button>
      <button
        onClick={() => onAdd('markdown')}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/40 hover:border-border bg-card/40 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Markdown
      </button>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

function CodeCellEditor({
  source, editable, language, onChange,
}: { source: string; editable: boolean; language?: string; onChange: (next: string) => void }) {
  const ref = useAutoGrow(source);
  if (!editable) {
    return (
      <pre
        className="overflow-x-auto text-[12.5px] leading-[1.55]"
        style={{
          background: '#1a1a1a',
          color: '#d4d4d4',
          padding: '12px 16px',
          margin: 0,
          fontFamily: "'Consolas','Monaco','Courier New',monospace",
          whiteSpace: 'pre',
        }}
      >
        <code className={language ? `language-${language}` : undefined}>{source || ' '}</code>
      </pre>
    );
  }
  return (
    <textarea
      ref={ref}
      value={source}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="block w-full resize-none border-0 outline-none focus:ring-0 text-[12.5px] leading-[1.55]"
      style={{
        background: '#1a1a1a',
        color: '#d4d4d4',
        padding: '12px 16px',
        fontFamily: "'Consolas','Monaco','Courier New',monospace",
        whiteSpace: 'pre',
        overflow: 'hidden',
        minHeight: '1.55em',
      }}
    />
  );
}

function MarkdownCell({
  source, editable, isEditing, canMoveUp, canMoveDown,
  onSourceChange, onStartEdit, onStopEdit, onDelete, onMoveUp, onMoveDown, onConvert,
}: {
  source: string;
  editable: boolean;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSourceChange: (next: string) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConvert: () => void;
}) {
  const ref = useAutoGrow(source);

  if (isEditing) {
    return (
      <div className="my-3 rounded-md overflow-hidden" style={{ border: '1px solid rgba(139,92,246,0.30)' }}>
        <div className="flex items-center justify-between px-3 py-1.5 text-[10px]" style={{ background: '#0f0f0f', color: 'rgba(148,163,184,0.7)' }}>
          <span className="font-mono">markdown (editing)</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onStopEdit}
              className="flex items-center gap-1 hover:text-emerald-400 transition-colors"
            >
              <Check className="h-3 w-3" />
              Done
            </button>
            {editable && (
              <CellToolbar
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                onConvert={onConvert}
                onDelete={onDelete}
                convertLabel="Convert to code"
              />
            )}
          </div>
        </div>
        <textarea
          ref={ref}
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          spellCheck={false}
          className="block w-full resize-none border-0 outline-none focus:ring-0 text-[13px] leading-[1.6]"
          style={{
            background: '#1a1a1a',
            color: '#d4d4d4',
            padding: '12px 16px',
            fontFamily: "'Consolas','Monaco','Courier New',monospace",
            overflow: 'hidden',
            minHeight: '1.6em',
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="my-3 group rounded-md transition-colors"
      style={{ padding: '8px 4px' }}
    >
      <div className="flex items-start gap-2">
        <div className="md-body flex-1 min-w-0">
          {source.trim()
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
            : <p className="text-muted-foreground/40 italic text-sm">(empty markdown cell)</p>}
        </div>
        {editable && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
            <button
              onClick={onStartEdit}
              title="Edit cell"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <CellToolbar
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onConvert={onConvert}
              onDelete={onDelete}
              convertLabel="Convert to code"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CodeCell({
  cell, index, language, editable, stale, canMoveUp, canMoveDown,
  onSourceChange, onDelete, onMoveUp, onMoveDown, onConvert,
}: {
  cell: NotebookCell;
  index: number;
  language?: string;
  editable: boolean;
  stale: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSourceChange: (next: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConvert: () => void;
}) {
  const source = asString(cell.source);
  const execLabel = typeof cell.execution_count === 'number' ? `[${cell.execution_count}]` : '[ ]';

  return (
    <div className="my-3 group rounded-md overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px]" style={{ background: '#0f0f0f', color: 'rgba(148,163,184,0.7)' }}>
        <span className="font-mono" style={{ color: '#60a5fa' }}>{execLabel}</span>
        <span className="font-mono">cell {index + 1} · code{language ? ` · ${language}` : ''}</span>
        {stale && (
          <span
            className="font-mono text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}
            title="Edited — outputs may be stale"
          >
            modified
          </span>
        )}
        {editable && (
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <CellToolbar
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onConvert={onConvert}
              onDelete={onDelete}
              convertLabel="Convert to markdown"
            />
          </div>
        )}
      </div>
      <CodeCellEditor
        source={source}
        editable={editable}
        language={language}
        onChange={onSourceChange}
      />
      {cell.outputs && cell.outputs.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {cell.outputs.map((out, i) => (
            <Output key={i} output={out} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NotebookPreview({
  content,
  onChange,
}: {
  content: string;
  onChange?: (next: string) => void;
}) {
  const editable = !!onChange;

  // Parse fresh on every content change (parent is source of truth).
  const { notebook, parseError } = useMemo(() => {
    try {
      const nb = JSON.parse(content || '{}') as Notebook;
      return { notebook: nb, parseError: null as string | null };
    } catch (e) {
      return {
        notebook: null as Notebook | null,
        parseError: e instanceof Error ? e.message : 'Failed to parse notebook JSON',
      };
    }
  }, [content]);

  // UI-only state: which markdown cell is in edit mode, and which cells have
  // been touched since this component mounted (for the "modified" indicator
  // on code cells whose outputs are now stale).
  const [editingMd, setEditingMd] = useState<string | null>(null);
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());

  // If the underlying file changes from outside (e.g. raw-JSON edit, Claude
  // saving, etc.), drop stale state so we don't show a confusing "modified"
  // indicator on cells the user didn't touch this session.
  const lastContentRef = useRef(content);
  useEffect(() => {
    if (lastContentRef.current !== content && editable === false) {
      setStaleIds(new Set());
      setEditingMd(null);
    }
    lastContentRef.current = content;
  }, [content, editable]);

  if (parseError) {
    return (
      <div className="px-8 py-6 h-full overflow-auto" style={{ background: '#1e1e1e', color: '#d4d4d4' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <p className="text-sm text-red-400 mb-2">Couldn’t parse notebook JSON</p>
          <pre className="text-xs text-muted-foreground/70 font-mono">{parseError}</pre>
        </div>
      </div>
    );
  }

  const cells = notebook?.cells ?? [];
  const language = notebook?.metadata?.language_info?.name
    ?? notebook?.metadata?.kernelspec?.name
    ?? 'python';
  const kernel = notebook?.metadata?.kernelspec?.display_name ?? language;

  // Map index → stable cell key. Prefer cell.id (nbformat 4.5+); fall back to
  // index for older notebooks. Used for editingMd / staleIds tracking so the
  // state survives sibling-cell inserts/deletes.
  const cellKey = (cell: NotebookCell, idx: number) => cell.id ?? `idx:${idx}`;

  const writeCells = (newCells: NotebookCell[]) => {
    if (!notebook || !onChange) return;
    onChange(serialize({ ...notebook, cells: newCells }));
  };

  const updateSource = (idx: number, newSource: string) => {
    if (!notebook) return;
    const cell = cells[idx];
    const next = [...cells];
    next[idx] = { ...cell, source: newSource };
    // Code cells: edit invalidates outputs — flag stale until the user
    // re-saves and the file is re-loaded (clearing the local set).
    if (cell.cell_type === 'code') {
      setStaleIds((prev) => {
        const n = new Set(prev);
        n.add(cellKey(cell, idx));
        return n;
      });
    }
    writeCells(next);
  };

  const deleteCell = (idx: number) => {
    const cell = cells[idx];
    if (!cell) return;
    const next = cells.filter((_, i) => i !== idx);
    setEditingMd((prev) => (prev === cellKey(cell, idx) ? null : prev));
    writeCells(next);
  };

  const insertCell = (atIdx: number, type: 'code' | 'markdown') => {
    if (!notebook) return;
    const next = [...cells];
    next.splice(atIdx, 0, newCell(type));
    writeCells(next);
  };

  const moveCell = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= cells.length) return;
    const next = [...cells];
    [next[idx], next[target]] = [next[target], next[idx]];
    writeCells(next);
  };

  const convertCell = (idx: number) => {
    const cell = cells[idx];
    if (!cell || cell.cell_type === 'raw') return;
    const newType: 'code' | 'markdown' = cell.cell_type === 'code' ? 'markdown' : 'code';
    const next = [...cells];
    const converted: NotebookCell = {
      cell_type: newType,
      source: cell.source,
      id: cell.id,
      metadata: cell.metadata ?? {},
    };
    if (newType === 'code') {
      converted.execution_count = null;
      converted.outputs = [];
    }
    next[idx] = converted;
    // If converting away from a markdown cell that was being edited, drop edit state.
    if (cell.cell_type === 'markdown' && editingMd === cellKey(cell, idx)) {
      setEditingMd(null);
    }
    // Code → markdown drops outputs; clear staleness on this cell.
    setStaleIds((prev) => {
      if (!prev.has(cellKey(cell, idx))) return prev;
      const n = new Set(prev);
      n.delete(cellKey(cell, idx));
      return n;
    });
    writeCells(next);
  };

  return (
    <div className="h-full overflow-auto" style={{ background: '#1e1e1e', color: '#d4d4d4' }}>
      <div
        style={{
          maxWidth: 920, margin: '0 auto', padding: '24px 32px',
          fontFamily: "'Segoe WPC','Segoe UI',sans-serif", fontSize: 14, lineHeight: 1.7,
        }}
      >
        <style>{`
          .md-body h1 { font-size: 1.75em; font-weight: 700; border-bottom: 1px solid #3e3e3e; padding-bottom: .3em; margin: .8em 0 .5em; }
          .md-body h2 { font-size: 1.4em; font-weight: 600; border-bottom: 1px solid #3e3e3e; padding-bottom: .3em; margin: .8em 0 .4em; }
          .md-body h3 { font-size: 1.2em; font-weight: 600; margin: .7em 0 .3em; }
          .md-body h4,h5,h6 { font-weight: 600; margin: .5em 0 .3em; }
          .md-body p { margin: .5em 0; }
          .md-body ul { list-style: disc; padding-left: 1.5em; margin: .4em 0; }
          .md-body ol { list-style: decimal; padding-left: 1.5em; margin: .4em 0; }
          .md-body li { margin: .2em 0; }
          .md-body hr { border: none; border-top: 1px solid #3e3e3e; margin: 1.5em 0; }
          .md-body pre { background: #2d2d2d; border-radius: 4px; margin: .75em 0; padding: 10px 14px; overflow: auto; font-family: 'Consolas','Monaco','Courier New',monospace; font-size: 12.5px; }
          .md-body code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; font-family: 'Consolas','Monaco','Courier New',monospace; font-size: .9em; }
          .md-body pre code { background: none; padding: 0; }
          .md-body img { max-width: 100%; }
          .md-body table { border-collapse: collapse; margin: .5em 0; }
          .md-body th, .md-body td { border: 1px solid #3e3e3e; padding: 4px 8px; }
        `}</style>

        <div className="flex items-center gap-3 mb-4 pb-2" style={{ borderBottom: '1px solid #2a2a2a' }}>
          <span className="text-[11px] font-mono text-muted-foreground/70">
            {cells.length} cell{cells.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground/70">·</span>
          <span className="text-[11px] font-mono" style={{ color: '#60a5fa' }}>{kernel}</span>
          {notebook?.nbformat && (
            <>
              <span className="text-[11px] font-mono text-muted-foreground/70">·</span>
              <span className="text-[11px] font-mono text-muted-foreground/70">
                nbformat {notebook.nbformat}
              </span>
            </>
          )}
          {editable && staleIds.size > 0 && (
            <span
              className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}
              title="Save to persist edits"
            >
              {staleIds.size} unsaved cell{staleIds.size !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {cells.length === 0 ? (
          editable ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-sm text-muted-foreground/60 italic">This notebook has no cells.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => insertCell(0, 'code')}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded border border-border/40 hover:border-border bg-card/40 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Code
                </button>
                <button
                  onClick={() => insertCell(0, 'markdown')}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded border border-border/40 hover:border-border bg-card/40 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Markdown
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">This notebook has no cells.</p>
          )
        ) : (
          <>
            {cells.map((cell, i) => {
              const key = cellKey(cell, i);
              const canMoveUp = i > 0;
              const canMoveDown = i < cells.length - 1;
              const cellNode = cell.cell_type === 'markdown' ? (
                <MarkdownCell
                  source={asString(cell.source)}
                  editable={editable}
                  isEditing={editingMd === key}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onSourceChange={(next) => updateSource(i, next)}
                  onStartEdit={() => setEditingMd(key)}
                  onStopEdit={() => setEditingMd(null)}
                  onDelete={() => deleteCell(i)}
                  onMoveUp={() => moveCell(i, -1)}
                  onMoveDown={() => moveCell(i, 1)}
                  onConvert={() => convertCell(i)}
                />
              ) : cell.cell_type === 'raw' ? (
                <pre
                  className="text-[12.5px] leading-[1.55]"
                  style={{
                    background: '#1a1a1a', color: '#9ca3af',
                    padding: '12px 16px', margin: '12px 0', borderRadius: 6,
                    fontFamily: "'Consolas','Monaco','Courier New',monospace",
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}
                >
                  {asString(cell.source) || ' '}
                </pre>
              ) : (
                <CodeCell
                  cell={cell}
                  index={i}
                  language={language}
                  editable={editable}
                  stale={staleIds.has(key)}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onSourceChange={(next) => updateSource(i, next)}
                  onDelete={() => deleteCell(i)}
                  onMoveUp={() => moveCell(i, -1)}
                  onMoveDown={() => moveCell(i, 1)}
                  onConvert={() => convertCell(i)}
                />
              );
              return (
                <Fragment key={key}>
                  {editable && <AddCellRow onAdd={(type) => insertCell(i, type)} />}
                  {cellNode}
                </Fragment>
              );
            })}
            {editable && <AddCellRow onAdd={(type) => insertCell(cells.length, type)} />}
          </>
        )}
      </div>
    </div>
  );
}
