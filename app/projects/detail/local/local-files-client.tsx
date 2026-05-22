'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ExternalLink, FileText, CheckCircle2, AlertTriangle, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MemoryPreviewModal } from './memory-preview-modal';

interface TranscriptFile {
  session_id: string;
  file_name: string;
  size_bytes: number;
  modified_at: string;
  tracked_in_db: boolean;
}

interface SubagentDir {
  name: string;
  file_count: number;
  modified_at: string;
}

interface MemoryFile {
  name: string;
  size_bytes: number;
  modified_at: string;
}

interface LocalFilesData {
  claude_folder_path: string;
  claude_folder_path_full: string;
  claude_folder_exists: boolean;
  transcripts: TranscriptFile[];
  subagent_dirs: SubagentDir[];
  memory: {
    exists: boolean;
    file_count: number;
    memory_md_excerpt: string | null;
    files: MemoryFile[];
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

function formatMtime(iso: string): string {
  return format(new Date(iso), 'MMM d, yyyy HH:mm');
}

interface LocalFilesClientProps {
  data: LocalFilesData;
  project: string;
  initialOpenFile?: string;
}

export function LocalFilesClient({ data, project, initialOpenFile }: LocalFilesClientProps) {
  const [modalFile, setModalFile] = useState<string | null>(null);

  useEffect(() => {
    if (initialOpenFile) {
      setModalFile(initialOpenFile);
    }
  }, [initialOpenFile]);

  const { claude_folder_path, claude_folder_path_full, transcripts, subagent_dirs, memory } = data;

  // Use the full OS path for the chat root URL so /api/chat/filetree can resolve it
  const chatRootUrl = `/chat?root=${encodeURIComponent(claude_folder_path_full)}&from=${encodeURIComponent(project)}`;

  return (
    <div className="space-y-5">
      {/* Top-right: Open in app editor */}
      <div className="flex justify-end">
        <Link
          href={chatRootUrl}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-3 py-1.5 bg-background hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in app editor
        </Link>
      </div>

      {/* Memory section */}
      {memory.exists && memory.files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Memory
              <span className="text-muted-foreground font-normal">({memory.file_count})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground">File</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground text-right hidden md:table-cell">Size</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground text-right hidden md:table-cell">Modified</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {memory.files.map((f) => (
                    <tr key={f.name} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2">
                        <span className="font-medium text-foreground/80 font-mono">{f.name}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground tabular-nums hidden md:table-cell">
                        {formatBytes(f.size_bytes)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap hidden md:table-cell">
                        {formatMtime(f.modified_at)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setModalFile(f.name)}
                          className="text-xs font-medium text-primary/70 hover:text-primary transition-colors border border-border rounded px-2 py-0.5 bg-background hover:bg-muted"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcripts table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Transcripts
            <span className="text-muted-foreground font-normal">({transcripts.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transcripts.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No transcript files found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground">Session</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground">File</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground text-right hidden md:table-cell">Size</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground text-right hidden md:table-cell">Modified</th>
                    <th className="px-4 pb-2 pt-3 font-medium text-muted-foreground text-right hidden md:table-cell">Tracked</th>
                  </tr>
                </thead>
                <tbody>
                  {transcripts.map((t) => (
                    <tr key={t.session_id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2">
                        {t.tracked_in_db ? (
                          <Link
                            href={`/conversations/${t.session_id}`}
                            className="font-mono text-primary/70 hover:text-primary transition-colors"
                          >
                            {t.session_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            {t.session_id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground font-mono">{t.file_name}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground tabular-nums hidden md:table-cell">
                        {formatBytes(t.size_bytes)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap hidden md:table-cell">
                        {formatMtime(t.modified_at)}
                      </td>
                      <td className="px-4 py-2 text-right hidden md:table-cell">
                        {t.tracked_in_db ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[11px] font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            tracked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-amber-400/70 text-[11px] font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            untracked
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subagent dirs (compact inline) */}
      {subagent_dirs.length > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Subagent dirs ({subagent_dirs.length}): {subagent_dirs.map((d) => d.name.slice(0, 8)).join(', ')}
        </p>
      )}

      {/* Memory preview modal */}
      <MemoryPreviewModal
        open={modalFile !== null}
        onClose={() => setModalFile(null)}
        project={project}
        fileName={modalFile ?? ''}
        claudeFolderPath={claude_folder_path_full}
        onSwitchFile={(fileName) => setModalFile(fileName)}
      />
    </div>
  );
}
