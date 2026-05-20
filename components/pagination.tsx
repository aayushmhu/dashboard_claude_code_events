import Link from 'next/link';

export function PaginationInfo({ page, total_pages }: { page: number; total_pages: number }) {
  if (total_pages <= 1) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Page {page} of {total_pages}
    </span>
  );
}

export function PaginationLinks({
  page,
  total_pages,
  makeHref,
}: {
  page: number;
  total_pages: number;
  makeHref: (p: number) => string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {page > 1 && (
        <Link
          href={makeHref(page - 1)}
          className="px-3 py-1 rounded-md border border-border hover:bg-accent transition-colors"
        >
          Previous
        </Link>
      )}
      <span className="text-muted-foreground text-xs">
        {page} / {total_pages}
      </span>
      {page < total_pages && (
        <Link
          href={makeHref(page + 1)}
          className="px-3 py-1 rounded-md border border-border hover:bg-accent transition-colors"
        >
          Next
        </Link>
      )}
    </div>
  );
}
