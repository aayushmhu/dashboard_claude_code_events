import { Suspense } from 'react';
import { Header } from '@/components/header';
import { ConversationsClient } from './client';
import { Session } from '@/lib/types';

async function getSessions() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/sessions?limit=100`, { cache: 'no-store' });
  const data = await res.json();
  return data.sessions as Session[];
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sp = await searchParams;
  const sessions = await getSessions();

  return (
    <div className="flex flex-col h-full">
      <Header title="Conversations" />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="p-6 text-muted-foreground text-sm">Loading…</div>}>
          <ConversationsClient sessions={sessions} selectedId={sp.session} />
        </Suspense>
      </div>
    </div>
  );
}
