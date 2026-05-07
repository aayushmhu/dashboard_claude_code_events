import type { Metadata } from 'next';
import { ChatClient } from '../client';
import { Session } from '@/lib/types';

export const metadata: Metadata = { title: 'Chat' };

async function getSessions(): Promise<Session[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/sessions?limit=100`, { cache: 'no-store' });
    const data = await res.json();
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessions = await getSessions();
  return <ChatClient initialSessions={sessions} initialSessionId={id} />;
}
