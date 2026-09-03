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
}) {
  return (
    <main style={{ maxWidth: '96rem', margin: '0 auto', padding: '1.25rem' }}>
      {above}

      <header style={headerStyle}>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>{heading}</h1>
        <Link href="/" style={{ fontSize: '12px' }}>
          {SITE_NAME}
        </Link>
      </header>

      {intro && <p style={introStyle}>{intro}</p>}

      <DispersionStrip view={view} />

      <div style={layout}>
        <aside style={rail}>
          <FacetRail
            query={query}
            counts={view.facetCounts}
            activeCount={activeFilterCount(query)}
            action={action}
          />
        </aside>

        <section style={{ minWidth: 0 }}>
          <DriveTable view={view} query={query} subId={subId} />
          {below}
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '0.75rem',
  borderBottom: '1px solid var(--border)',
  paddingBottom: '0.6rem',
  marginBottom: '0.75rem',
  flexWrap: 'wrap',
};

const introStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  color: 'var(--fg-muted)',
  maxWidth: '78ch',
};

const layout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(190px, 220px) minmax(0, 1fr)',
  gap: '1.5rem',
  alignItems: 'start',
};

const rail: React.CSSProperties = { position: 'sticky', top: '1rem' };
