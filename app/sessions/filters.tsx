'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectStats, Session } from '@/lib/types';
import { getProjectName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScopePicker } from '@/components/scope-picker';
import { Download } from 'lucide-react';

interface SessionFiltersProps {
  projects: ProjectStats[];
}

function buildCsv(sessions: Session[]): string {
  const headers = ['session_id', 'project_name', 'started_at', 'last_seen_at', 'duration_seconds', 'event_count', 'total_tokens', 'error_count'];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = sessions.map((s) =>
    [s.session_id, s.project_name, s.started_at, s.last_seen_at, s.duration_seconds, s.event_count, s.total_tokens, s.error_count]
      .map(escape)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SessionFilters({ projects }: SessionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exporting, setExporting] = useState(false);

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

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set('limit', 'all');
      params.delete('page');
      const res = await fetch(`/api/sessions?${params}`);
      const { sessions } = await res.json();
      triggerDownload(buildCsv(sessions ?? []), 'sessions.csv');
    } finally {
      setExporting(false);
    }
  }

  const hasCustomRange = !!(searchParams.get('start') || searchParams.get('end'));
  const scopeParam = searchParams.get('scope') ?? '';
  const activeScope = hasCustomRange
    ? ''
    : (['24h', '7d', '30d', 'all'].includes(scopeParam) ? scopeParam : 'all');
  const hasActiveFilters = currentProject || hasErrors || hasCustomRange || (scopeParam && scopeParam !== 'all');

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select
        value={currentProject || '__all__'}
        onValueChange={(v) => updateFilter('project', v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-48 h-8">
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
        className="h-8"
      >
        Errors only
      </Button>

      <ScopePicker
        current={activeScope}
        options={['24h', '7d', '30d', 'all']}
        clearDateRange
        customMode
      />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/sessions')}
          className="h-8 text-muted-foreground"
        >
          Clear filters
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={exporting}
        className="ml-auto h-8 px-2.5 text-xs gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        {exporting ? 'Exporting…' : 'Export CSV'}
      </Button>
    </div>
  );
}
