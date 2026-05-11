import type { Metadata } from 'next';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'Sessions' };
import { SessionTable } from '@/components/session-table';
import { Card, CardContent } from '@/components/ui/card';
import { Session, ProjectStats } from '@/lib/types';
import { SessionFilters } from './filters';

interface SearchParams {
  project?: string;
  page?: string;
  has_errors?: string;
  start?: string;
  end?: string;
}

async function getData(searchParams: SearchParams) {
  const base = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const params = new URLSearchParams();
  if (searchParams.project) params.set('project', searchParams.project);
  if (searchParams.page) params.set('page', searchParams.page);
  if (searchParams.has_errors) params.set('has_errors', searchParams.has_errors);
  if (searchParams.start) params.set('start', searchParams.start);
  if (searchParams.end) params.set('end', searchParams.end);
  params.set('limit', '20');

  const [sessionsRes, projects] = await Promise.all([
    fetch(`${base}/api/sessions?${params}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${base}/api/projects`, { cache: 'no-store' }).then((r) => r.json()),
  ]);

  return { sessionsRes, projects };
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { sessionsRes, projects } = await getData(sp);
  const { sessions, total, total_pages, page } = sessionsRes as {
    sessions: Session[];
    total: number;
    total_pages: number;
    page: number;
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Sessions" />
      <div className="flex-1 p-6 space-y-4">
        <SessionFilters projects={projects as ProjectStats[]} />

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {total} session{total !== 1 ? 's' : ''}
              </p>
              <PaginationInfo page={page} total_pages={total_pages} />
            </div>
            <SessionTable sessions={sessions} />
            {total_pages > 1 && (
              <div className="mt-4 flex justify-center">
                <PaginationLinks page={page} total_pages={total_pages} searchParams={sp} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PaginationInfo({ page, total_pages }: { page: number; total_pages: number }) {
  if (total_pages <= 1) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Page {page} of {total_pages}
    </span>
  );
}

function PaginationLinks({
  page,
  total_pages,
  searchParams,
}: {
  page: number;
  total_pages: number;
  searchParams: SearchParams;
}) {
  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    if (searchParams.project) params.set('project', searchParams.project);
    if (searchParams.has_errors) params.set('has_errors', searchParams.has_errors);
    if (searchParams.start) params.set('start', searchParams.start);
    if (searchParams.end) params.set('end', searchParams.end);
    params.set('page', String(p));
    return `/sessions?${params}`;
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      {page > 1 && (
        <a
          href={makeHref(page - 1)}
          className="px-3 py-1 rounded-md border border-border hover:bg-accent transition-colors"
        >
          Previous
        </a>
      )}
      <span className="text-muted-foreground text-xs">
        {page} / {total_pages}
      </span>
      {page < total_pages && (
        <a
          href={makeHref(page + 1)}
          className="px-3 py-1 rounded-md border border-border hover:bg-accent transition-colors"
        >
          Next
        </a>
      )}
    </div>
  );
}
