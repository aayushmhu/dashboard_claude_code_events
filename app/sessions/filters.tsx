'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectStats } from '@/lib/types';
import { getProjectName } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SessionFiltersProps {
  projects: ProjectStats[];
}

export function SessionFilters({ projects }: SessionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentProject = searchParams.get('project') || '';
  const hasErrors = searchParams.get('has_errors') === 'true';

  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/sessions?${params}`);
  }

  const hasActiveFilters = currentProject || hasErrors;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select
        value={currentProject || '__all__'}
        onValueChange={(v) => updateFilter('project', v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.project_dir} value={p.project_dir}>
              {getProjectName(p.project_dir)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={hasErrors ? 'default' : 'outline'}
        size="sm"
        onClick={() => updateFilter('has_errors', hasErrors ? null : 'true')}
      >
        Errors only
      </Button>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/sessions')}
          className="text-muted-foreground"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
