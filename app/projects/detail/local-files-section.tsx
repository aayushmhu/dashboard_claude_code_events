'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { FolderOpen, Copy, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LocalFilesData {
  claude_folder_path: string;
  claude_folder_path_full: string;
  claude_folder_exists: boolean;
  memory: {
    exists: boolean;
    file_count: number;
    memory_md_excerpt: string | null;
  };
  totals: {
    transcript_count: number;
    transcript_total_bytes: number;
    subagent_dir_count: number;
    memory_file_count: number;
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      title="Copy path"
      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function LocalFilesSection({ project }: { project: string }) {
  const [data, setData] = useState<LocalFilesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string>('');

  const encodedProject = encodeURIComponent(project);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/local-files?project=${encodedProject}`);
      if (res.status === 404) {
        // Build the expected tilde path for empty state display
        const slug = project.replace(/\//g, '-');
        const displayPath = `~/.claude/projects/${slug}`;
        setFolderPath(displayPath);
        setData({ claude_folder_path: displayPath, claude_folder_path_full: '', claude_folder_exists: false, memory: { exists: false, file_count: 0, memory_md_excerpt: null }, totals: { transcript_count: 0, transcript_total_bytes: 0, subagent_dir_count: 0, memory_file_count: 0 } });
        return;
      }
      if (!res.ok) {
        setError('Failed to load local files');
        return;
      }
      const json = await res.json();
      setData(json);
      setFolderPath(json.claude_folder_path);
    } catch {
      setError('Failed to load local files');
    } finally {
      setLoading(false);
    }
  }, [encodedProject, project]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Local Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 animate-pulse">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Local Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.claude_folder_exists) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Local Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No local Claude Code data for this project at{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{folderPath}</code>.
            {' '}Run a Claude Code session here to populate it.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { totals, memory } = data;
  const claudeFolderFull = data.claude_folder_path_full;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          Local Files
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Path row */}
        <div className="flex items-center gap-1.5 min-w-0">
          <code className="text-xs text-muted-foreground font-mono truncate" title={folderPath}>
            {folderPath}
          </code>
          <CopyPathButton path={folderPath} />
        </div>

        {/* Memory teaser */}
        {memory.exists && memory.memory_md_excerpt && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
              MEMORY.md
            </p>
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs prose-p:leading-relaxed prose-p:my-0.5 prose-headings:my-1 prose-headings:text-sm prose-a:text-primary relative overflow-hidden" style={{ maxHeight: '9em', WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)' }}>
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => {
                    if (!href || href.startsWith('http')) {
                      return (
                        <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {children}
                        </a>
                      );
                    }
                    if (href.endsWith('.md')) {
                      const fileName = href.replace(/^\.?\//, '').split('/').pop() ?? href;
                      return (
                        <Link
                          href={`/projects/detail/local?project=${encodedProject}&open=${encodeURIComponent(fileName)}`}
                          className="text-primary hover:underline"
                        >
                          {children}
                        </Link>
                      );
                    }
                    return <span>{children}</span>;
                  },
                }}
              >
                {memory.memory_md_excerpt}
              </ReactMarkdown>
            </div>
            <Link
              href={`/projects/detail/local?project=${encodedProject}`}
              className="text-xs text-primary/70 hover:text-primary transition-colors mt-2 inline-block"
            >
              Read all {memory.file_count} memory {memory.file_count === 1 ? 'file' : 'files'} →
            </Link>
          </div>
        )}

        {/* Stats line */}
        <p className="text-xs text-muted-foreground tabular-nums">
          {totals.transcript_count} transcript{totals.transcript_count !== 1 ? 's' : ''}{' '}
          ({formatBytes(totals.transcript_total_bytes)}){' '}
          · {totals.subagent_dir_count} subagent dir{totals.subagent_dir_count !== 1 ? 's' : ''}{' '}
          · {totals.memory_file_count} memory file{totals.memory_file_count !== 1 ? 's' : ''}
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Link
            href={`/projects/detail/local?project=${encodedProject}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-md border-0"
          >
            View all local files →
          </Link>
          <Link
            href={`/chat?root=${encodeURIComponent(claudeFolderFull)}&from=${encodeURIComponent(project)}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-3 py-1.5 bg-background hover:bg-muted"
          >
            <ExternalLink className="h-3 w-3" />
            Open in app editor
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
