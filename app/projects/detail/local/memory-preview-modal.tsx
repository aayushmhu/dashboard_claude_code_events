'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface MemoryFileData {
  file_name: string;
  size_bytes: number;
  modified_at: string;
  content: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface MemoryPreviewModalProps {
  open: boolean;
  onClose: () => void;
  project: string;
  fileName: string;
  claudeFolderPath: string;
  onSwitchFile?: (fileName: string) => void;
}

export function MemoryPreviewModal({
  open,
  onClose,
  project,
  fileName,
  claudeFolderPath,
  onSwitchFile,
}: MemoryPreviewModalProps) {
  const [data, setData] = useState<MemoryFileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !fileName) return;
    setData(null);
    setTooLarge(false);
    setError(null);
    setLoading(true);

    const params = new URLSearchParams({ project, file: fileName });
    fetch(`/api/projects/local-files/memory?${params}`)
      .then(async (res) => {
        if (res.status === 413) {
          setTooLarge(true);
          return;
        }
        if (!res.ok) {
          setError(`Failed to load file (${res.status})`);
          return;
        }
        const json = await res.json();
        setData(json);
      })
      .catch(() => setError('Failed to load file'))
      .finally(() => setLoading(false));
  }, [open, fileName, project]);

  const chatRootUrl = `/chat?root=${encodeURIComponent(claudeFolderPath)}`;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-sm truncate">{fileName}</span>
          </DialogTitle>
          {data ? (
            <DialogDescription>
              {formatBytes(data.size_bytes)} · modified {new Date(data.modified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{fileName}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 border-t border-border/40 pt-4">
          {loading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-5/6 rounded bg-muted" />
              <div className="h-3 w-4/6 rounded bg-muted" />
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {tooLarge && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                File too large to preview here (over 1 MB).
              </p>
              <Link
                href={chatRootUrl}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open folder in app editor
              </Link>
            </div>
          )}

          {data && !loading && (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-code:break-words prose-a:text-primary">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    if (!href || href.startsWith('http://') || href.startsWith('https://')) {
                      return (
                        <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {children}
                        </a>
                      );
                    }
                    if (href.endsWith('.md')) {
                      const targetFile = href.replace(/^\.?\//, '').split('/').pop() ?? href;
                      return (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            onSwitchFile?.(targetFile);
                          }}
                        >
                          {children}
                        </button>
                      );
                    }
                    return <span>{children}</span>;
                  },
                }}
              >
                {data.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
