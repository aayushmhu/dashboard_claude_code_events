import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/header';
import { LocalFilesClient } from './local-files-client';

interface LocalFilesResponse {
  claude_folder_path: string;
  claude_folder_path_full: string;
  claude_folder_exists: boolean;
  transcripts: Array<{
    session_id: string;
    file_name: string;
    size_bytes: number;
    modified_at: string;
    tracked_in_db: boolean;
  }>;
  subagent_dirs: Array<{
    name: string;
    file_count: number;
    modified_at: string;
  }>;
  memory: {
    exists: boolean;
    file_count: number;
    memory_md_excerpt: string | null;
    files: Array<{ name: string; size_bytes: number; modified_at: string }>;
  };
  totals: {
    transcript_count: number;
    transcript_total_bytes: number;
    subagent_dir_count: number;
    memory_file_count: number;
  };
}

async function getLocalFiles(project: string): Promise<LocalFilesResponse | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    const res = await fetch(
      `${base}/api/projects/local-files?project=${encodeURIComponent(project)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; open?: string }>;
}): Promise<Metadata> {
  const { project } = await searchParams;
  if (!project) return { title: 'Local Files' };
  const name = project.split('/').pop() ?? project;
  return { title: `${name} · Local Files · Claude Code Dashboard` };
}

export default async function LocalFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; open?: string }>;
}) {
  const { project, open } = await searchParams;
  if (!project) notFound();

  const data = await getLocalFiles(project);
  if (!data) notFound();

  const projectName = project.split('/').pop() ?? project;
  const encodedProject = encodeURIComponent(project);

  return (
    <div className="flex flex-col h-full">
      <Header title={`${projectName} · Local Files`} />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-5 overflow-y-auto">
        {/* Back link */}
        <div>
          <Link
            href={`/projects/detail?project=${encodedProject}`}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Project detail
          </Link>
        </div>

        <LocalFilesClient data={data} project={project} initialOpenFile={open} />
      </div>
    </div>
  );
}
