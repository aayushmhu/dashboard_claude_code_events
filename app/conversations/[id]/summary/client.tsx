'use client';

import { Session } from '@/lib/types';
import { SessionViewShell } from '@/components/session-view-shell';
import { SessionSummary } from '@/components/session-summary';

interface SummaryShellClientProps {
  sessions: Session[];
  sessionId: string;
}

export function SummaryShellClient({ sessions, sessionId }: SummaryShellClientProps) {
  return (
    <SessionViewShell
      sessions={sessions}
      selectedId={sessionId}
      activeTab="summary"
    >
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 lg:p-6">
        <SessionSummary sessionId={sessionId} mode="page" />
      </div>
    </SessionViewShell>
  );
}
