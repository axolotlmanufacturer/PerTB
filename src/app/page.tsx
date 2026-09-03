import { DispersionStrip } from '@/components/DispersionStrip';
import { DriveTable } from '@/components/DriveTable';
import { FacetRail } from '@/components/FacetRail';
import { loadDriveRows } from '@/lib/offers';
import { activeFilterCount, parseQuery } from '@/lib/query';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import { buildTable } from '@/lib/table';

/**
 * The table page.
 *
 * A Server Component that reads searchParams, queries Postgres once, and emits
 * fully-populated <table> markup. It must NOT become a client component and
 * the table must NOT be fetched from the browser: the entire business model is
 * organic search for long-tail comparison queries, and Googlebot's first paint
 * would be an empty table (CLAUDE.md §6).
 *
 * `/api/offers` exists for optimistic client-side refetches, but the page is
 * complete and correct with JavaScript disabled.
 */

// Offers expire on a 6-hour TTL and the ingest job revalidates on completion,
// so this is a floor rather than the real refresh cadence.
export const revalidate = 900;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseQuery(await searchParams);
  const rows = await loadDriveRows();
  const view = buildTable(rows, query);

  return (
    <main style={{ maxWidth: '96rem', margin: '0 auto', padding: '1.25rem' }}>
      <header style={header}>
        <h1 style={{ fontSize: '1.1rem', margin: 0 }}>{SITE_NAME}</h1>
        <p style={{ margin: 0, color: 'var(--fg-muted)' }}>{SITE_TAGLINE}</p>
      </header>

      <DispersionStrip view={view} />

      <div style={layout}>
        <aside style={rail}>
          <FacetRail
            query={query}
            counts={view.facetCounts}
            activeCount={activeFilterCount(query)}
          />
        </aside>

        <section style={{ minWidth: 0 }}>
          <DriveTable view={view} query={query} />
        </section>
      </div>
    </main>
  );
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.75rem',
  borderBottom: '1px solid var(--border)',
  paddingBottom: '0.6rem',
  marginBottom: '1rem',
  flexWrap: 'wrap',
};

const layout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(190px, 220px) minmax(0, 1fr)',
  gap: '1.5rem',
  alignItems: 'start',
};

const rail: React.CSSProperties = {
  position: 'sticky',
  top: '1rem',
};
