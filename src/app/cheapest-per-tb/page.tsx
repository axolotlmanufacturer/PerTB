import type { Metadata } from 'next';
import { RelatedViews } from '@/components/RelatedViews';
import {
  Breadcrumb,
  BreadcrumbJsonLd,
  ItemListJsonLd,
  type Crumb,
} from '@/components/Seo';
import { TablePage } from '@/components/TableView';
import { CHEAPEST_LANDING, resolveRelated } from '@/lib/landings';
import { loadDriveRows } from '@/lib/offers';
import { parseQuery } from '@/lib/query';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { buildTable } from '@/lib/table';

/**
 * The one cross-cutting route.
 *
 * It has no category segment, so it cannot live under [category]/[slug].
 * Appendix C specifies this exact URL and a curated route is worth its own
 * file rather than being relocated for tidier routing.
 */

export const revalidate = 900;

const PATH = `/${CHEAPEST_LANDING.slug}`;

export const metadata: Metadata = {
  title: CHEAPEST_LANDING.title,
  description: CHEAPEST_LANDING.description,
  alternates: { canonical: PATH },
  openGraph: {
    title: CHEAPEST_LANDING.title,
    description: CHEAPEST_LANDING.description,
    url: new URL(PATH, SITE_URL).toString(),
    siteName: SITE_NAME,
    type: 'website',
  },
};

const CRUMBS: Crumb[] = [
  { name: SITE_NAME, path: '/' },
  { name: CHEAPEST_LANDING.label, path: PATH },
];

export default async function CheapestPerTbPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseQuery(await searchParams);
  const view = buildTable(await loadDriveRows(), query);

  // Reuses the shared related-views block by borrowing a category for
  // resolution; the links themselves are the same curated set.
  const related = {
    ...CHEAPEST_LANDING,
    category: 'hdd' as const,
    related: CHEAPEST_LANDING.related.filter(
      (slug) => resolveRelated(slug) !== undefined,
    ),
  };

  return (
    <>
      <BreadcrumbJsonLd crumbs={CRUMBS} />
      <ItemListJsonLd view={view} name={CHEAPEST_LANDING.title} />
      <TablePage
        view={view}
        query={query}
        subId={CHEAPEST_LANDING.slug}
        action={PATH}
        heading={CHEAPEST_LANDING.title}
        intro={CHEAPEST_LANDING.intro}
        above={<Breadcrumb crumbs={CRUMBS} />}
        below={<RelatedViews landing={related} />}
      />
    </>
  );
}
