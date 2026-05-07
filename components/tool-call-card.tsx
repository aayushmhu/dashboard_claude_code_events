'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TOOL_COLORS } from '@/lib/utils';

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
    <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words">
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
  const color = TOOL_COLORS[toolName] || 'hsl(215, 20%, 65%)';

  return (
    <div
      className={cn(
        'rounded-lg border bg-card/50 p-3 space-y-2 text-sm',
        isError ? 'border-destructive/40' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium text-xs">{toolName}</span>
        {isError && (
          <Badge variant="destructive" className="gap-1 ml-auto">
            <AlertCircle className="h-3 w-3" />
            Error
          </Badge>
        )}
      </div>

      {isError && errorMessage && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">
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
