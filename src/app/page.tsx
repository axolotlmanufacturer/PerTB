import { ItemListJsonLd } from '@/components/Seo';
import { TablePage } from '@/components/TableView';
import { loadDriveRows, loadPriceHistory } from '@/lib/offers';
import { parseQuery } from '@/lib/query';
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

  const now = new Date();
  const [rows, history] = await Promise.all([loadDriveRows(now), loadPriceHistory(now)]);
  const view = buildTable(rows, query, { history, now: now.getTime() });

  return (
    <>
      <ItemListJsonLd
        view={view}
        name={`${SITE_NAME} — all drives by price per terabyte`}
      />
      <TablePage
        view={view}
        query={query}
        subId="home"
        action="/"
        heading={SITE_NAME}
        intro={SITE_TAGLINE}
      />
    </>
  );
}
