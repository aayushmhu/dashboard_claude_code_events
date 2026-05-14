'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import { getToolDescription } from '@/lib/colors';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export function ToolNameCell({ toolName }: { toolName: string }) {
  const description = getToolDescription(toolName);

  return (
    <span className="inline-flex items-center gap-1.5">
      <Link
        href={`/tools/${encodeURIComponent(toolName)}`}
        className="font-medium hover:text-primary transition-colors"
      >
        {toolName}
      </Link>
      {description && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground/50 hover:text-muted-foreground cursor-help">
              <Info className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{description}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
