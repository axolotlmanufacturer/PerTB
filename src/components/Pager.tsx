import Link from 'next/link';
import { pageHref, PAGE_SIZE, type Query } from '@/lib/query';
import type { TableView } from '@/lib/table';

/**
 * Paging for the table.
 *
 * Real `<a href>`s carrying the whole query, so it works with JavaScript off
 * like everything else — and so a page of results is a shareable URL rather
 * than a scroll position.
 *
 * Deliberately not infinite scroll. This audience compares specific rows and
 * sends links to each other; a view you cannot link to is a view you cannot
 * argue about.
 */
export function Pager({
  view,
  query,
  basePath,
}: {
  view: TableView;
  query: Query;
  basePath: string;
}) {
  if (view.pageCount <= 1) return null;

  const first = (view.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(view.page * PAGE_SIZE, view.totalGroups);

  return (
    <nav className="pager" aria-label="Table pages">
      <span className="pager__count tabular">
        {first.toLocaleString('en-US')}–{last.toLocaleString('en-US')} of{' '}
        {view.totalGroups.toLocaleString('en-US')}
      </span>

      <span className="pager__links">
        {view.page > 1 ? (
          <Link
            className="pager__link"
            href={pageHref(basePath, query, view.page - 1)}
            rel="prev"
          >
            ← Previous
          </Link>
        ) : (
          <span className="pager__link pager__link--off">← Previous</span>
        )}

        <span className="pager__page tabular">
          Page {view.page} of {view.pageCount}
        </span>

        {view.page < view.pageCount ? (
          <Link
            className="pager__link"
            href={pageHref(basePath, query, view.page + 1)}
            rel="next"
          >
            Next →
          </Link>
        ) : (
          <span className="pager__link pager__link--off">Next →</span>
        )}
      </span>
    </nav>
  );
}
