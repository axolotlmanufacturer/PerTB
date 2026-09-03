import Link from 'next/link';
import { DispersionStrip } from '@/components/DispersionStrip';
import { DriveTable } from '@/components/DriveTable';
import { FacetRail } from '@/components/FacetRail';
import { SiteFooter } from '@/components/SiteFooter';
import { activeFilterCount, type Query } from '@/lib/query';
import { SITE_NAME } from '@/lib/site';
import type { TableView as TableViewModel } from '@/lib/table';

/**
 * The shared page shell: dispersion strip, facet rail, table, footer.
 *
 * The home page, every landing and the cross-cutting route all render this, so
 * they cannot drift apart — a landing that quietly lost the facet rail or the
 * disclosure footer would be a different product on the same domain.
 */
export function TablePage({
  view,
  query,
  subId,
  heading,
  intro,
  above,
  below,
  action,
  shuckColumn,
}: {
  view: TableViewModel;
  query: Query;
  /** Landing slug, so outbound revenue attributes to this route. */
  subId: string;
  heading: string;
  intro?: string;
  above?: React.ReactNode;
  below?: React.ReactNode;
  /** Form target, so filtering from a landing stays on that landing. */
  action: string;
  /** Only the shucking view asks for the external-vs-bare column. */
  shuckColumn?: boolean;
}) {
  return (
    <main className="shell">
      {above}

      <header className="masthead">
        <h1 className="masthead__title">{heading}</h1>
        {/* The way back to the full table — but not on the full table itself,
            where it would just be the heading printed twice. */}
        {heading !== SITE_NAME && (
          <Link href="/" className="masthead__home">
            All drives · {SITE_NAME}
          </Link>
        )}
      </header>

      {intro && <p className="intro">{intro}</p>}

      <DispersionStrip view={view} />

      <div className="layout">
        <aside className="layout__rail">
          <FacetRail
            query={query}
            counts={view.facetCounts}
            activeCount={activeFilterCount(query)}
            action={action}
          />
        </aside>

        <section className="layout__main">
          <DriveTable view={view} query={query} subId={subId} shuckColumn={shuckColumn} />
          {below}
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
