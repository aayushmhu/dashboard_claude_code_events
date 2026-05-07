'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { TOOL_COLORS, BUBBLE_COLORS } from '@/lib/colors';

interface ToolCallCardProps {
  toolName: string;
  toolInput: Record<string, unknown> | null;
  toolOutput: Record<string, unknown> | null;
  isError: boolean;
  errorMessage: string | null;
  timestamp: string;
}

function JsonBlock({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span className="text-muted-foreground">—</span>;

  let display: string;
  if (typeof data === 'string') {
    display = data.length > 2000 ? data.slice(0, 2000) + '\n…(truncated)' : data;
  } else {
    const str = JSON.stringify(data, null, 2);
    display = str.length > 4000 ? str.slice(0, 4000) + '\n…(truncated)' : str;
  }

  return (
    <pre
      className="overflow-x-auto rounded-md p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.15)' }}
    >
      {display}
    </pre>
  );
}

function CollapsibleSection({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && children}
    </div>
  );
}

export function ToolCallCard({
  toolName,
  toolInput,
  toolOutput,
  isError,
  errorMessage,
}: ToolCallCardProps) {
  const toolColor = TOOL_COLORS[toolName] || '#64748B';
  const bubble = isError ? BUBBLE_COLORS.toolError : BUBBLE_COLORS.tool;

  return (
    <div
      className="rounded-lg p-3 space-y-2 text-sm"
      style={{
        background: bubble.bg,
        border: `1px solid ${bubble.border}`,
      }}
    >
      <div className="flex items-center gap-2">
        {/* Tool name badge */}
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded"
          style={{
            background: `${toolColor}22`,
            color: toolColor,
            border: `1px solid ${toolColor}40`,
          }}
        >
          {toolName}
        </span>
        {isError && (
          <span
            className="flex items-center gap-1 text-[11px] font-medium ml-auto px-2 py-0.5 rounded"
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#EF4444',
              border: '1px solid rgba(239,68,68,0.35)',
            }}
          >
            <AlertCircle className="h-3 w-3" />
            Error
          </span>
        )}
      </div>

      {isError && errorMessage && (
        <p
          className="text-xs rounded p-2 font-mono"
          style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
        >
          {errorMessage}
        </p>
      )}

      {toolInput && (
        <CollapsibleSection label="Input">
          <JsonBlock data={toolInput} />
        </CollapsibleSection>
      )}

      {toolOutput && (
        <CollapsibleSection label="Output" defaultOpen={isError}>
          <JsonBlock data={toolOutput} />
        </CollapsibleSection>
      )}
    </div>
  );
}
