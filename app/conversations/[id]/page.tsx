import type { Metadata } from 'next';
import { ConversationsClient } from '../client';
import { Session } from '@/lib/types';

export const metadata: Metadata = { title: 'Conversations' };

async function getSessions(): Promise<Session[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(`${base}/api/sessions?limit=100`, { cache: 'no-store' });
    const data = await res.json();
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

export default async function ConversationsSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { id } = await params;
  const { focus } = await searchParams;
  const sessions = await getSessions();
  return <ConversationsClient sessions={sessions} selectedId={id} focusEventId={focus} />;
}
