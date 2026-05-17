import type { Metadata } from 'next';
import { SummaryShellClient } from './client';
import { Session } from '@/lib/types';

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

async function getProjectName(id: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(`${base}/api/sessions/${id}`, { cache: 'no-store' });
    if (!res.ok) return id.slice(0, 8);
    const data = await res.json();
    return data.project_name || id.slice(0, 8);
  } catch {
    return id.slice(0, 8);
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const projectName = await getProjectName(id);
  return {
    title: `Summary · ${projectName} · Claude Code Dashboard`,
  };
}

export default async function SessionSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessions = await getSessions();

  return <SummaryShellClient sessions={sessions} sessionId={id} />;
}
