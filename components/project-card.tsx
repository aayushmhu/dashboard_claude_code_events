import Link from 'next/link';
import { FolderOpen, AlertCircle, Wrench, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectStats } from '@/lib/types';
import { formatRelativeTime, formatTokens } from '@/lib/utils';

interface ProjectCardProps {
  project: ProjectStats;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/sessions?project=${encodeURIComponent(project.project_dir)}`}>
      <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="font-semibold truncate">{project.project_name}</p>
            </div>
            {project.error_count > 0 && (
              <Badge variant="destructive" className="shrink-0 gap-1">
                <AlertCircle className="h-3 w-3" />
                {project.error_count}
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground truncate" title={project.project_dir}>
            {project.project_dir}
          </p>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Sessions</p>
              <p className="font-semibold">{project.total_sessions}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Events</p>
              <p className="font-semibold">{project.total_events}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tokens</p>
              <p className="font-semibold">{project.total_tokens > 0 ? formatTokens(project.total_tokens) : '—'}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {project.top_tool && (
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                {project.top_tool}
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
