'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

// Portal the tooltip to document.body so it escapes:
//   1. The sidebar's `overflow-y-auto` clipping on its <nav>
//   2. The sidebar's stacking context (`z-40` on mobile, `z-auto` on desktop)
// Without the Portal, hover-tooltips on collapsed sidebar items get cut off /
// hidden under chat/conversation content. The Portal renders the tooltip at the
// document root with z-[300], above the chat page's `z-[200]` context menu.
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[300] overflow-hidden rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs text-card-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
