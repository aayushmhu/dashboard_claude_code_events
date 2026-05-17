import Link from 'next/link';
import { FolderOpen, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectStats } from '@/lib/types';
import { formatRelativeTime, formatTokens } from '@/lib/utils';
import { getToolColor } from '@/lib/colors';

interface ProjectCardProps {
  project: ProjectStats;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const topToolColor = project.top_tool ? getToolColor(project.top_tool) : null;

  return (
    <Link href={`/projects/detail?project=${encodeURIComponent(project.project_dir)}`}>
      <Card className="card-hover-glow hover:border-primary/30 transition-all cursor-pointer h-full">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="font-semibold truncate">{project.project_name}</p>
            </div>
            {project.error_count > 0 && (
              <span
                className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  color: '#EF4444',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}
              >
                <AlertCircle className="h-3 w-3" />
                {project.error_count}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground truncate font-mono" title={project.project_dir}>
            {project.project_dir}
          </p>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Sessions</p>
              <p className="font-semibold font-mono-num">{project.total_sessions}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Events</p>
              <p className="font-semibold font-mono-num">{project.total_events}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tokens</p>
              <p className="font-semibold font-mono-num">
                {project.total_tokens > 0 ? formatTokens(project.total_tokens) : '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {project.top_tool && topToolColor && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: topToolColor }}
                />
                <span style={{ color: topToolColor }}>{project.top_tool}</span>
              </span>
            )}
            <span className="flex items-center gap-1 ml-auto">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(project.last_active)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
