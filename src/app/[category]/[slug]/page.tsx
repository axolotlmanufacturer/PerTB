import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RelatedViews } from '@/components/RelatedViews';
import {
  Breadcrumb,
  BreadcrumbJsonLd,
  ItemListJsonLd,
  type Crumb,
} from '@/components/Seo';
import { TablePage } from '@/components/TableView';
import {
  LANDINGS,
  findLanding,
  landingPath,
  resolveLandingQuery,
  type Landing,
} from '@/lib/landings';
import { loadDriveRows } from '@/lib/offers';
import { parseQuery } from '@/lib/query';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { buildTable } from '@/lib/table';

/**
 * The curated landing routes.
 *
 * Every one is hand-written in landings.ts — this file renders them, it does
 * not generate them. See the warning at the top of landings.ts about doorway
 * spam: a full capacity × technology × interface matrix would be dozens of
 * near-identical pages and can get the whole domain classified.
 */

export const revalidate = 900;

/** Only the curated set exists. Anything else 404s rather than rendering. */
export const dynamicParams = false;

export function generateStaticParams(): { category: string; slug: string }[] {
  return LANDINGS.map((landing) => ({
    category: landing.category,
    slug: landing.slug,
  }));
}

type Params = { category: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category, slug } = await params;
  const landing = findLanding(category, slug);
  if (!landing) return {};

  const path = landingPath(landing);
  return {
    title: landing.title,
    description: landing.description,
    alternates: {
      // The bare path is canonical: filtered permutations of a landing must
      // not compete with it in the index.
      canonical: path,
    },
    openGraph: {
      title: landing.title,
      description: landing.description,
      url: new URL(path, SITE_URL).toString(),
      siteName: SITE_NAME,
      type: 'website',
    },
  };
}

function crumbsFor(landing: Landing): Crumb[] {
  return [
    { name: SITE_NAME, path: '/' },
    {
      name: landing.category === 'hdd' ? 'Hard drives' : 'Solid state',
      path: `/${landing.category}`,
    },
    { name: landing.label, path: landingPath(landing) },
  ];
}

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, slug } = await params;
  const landing = findLanding(category, slug);
  if (!landing) notFound();

  // The landing's filters are the base; anything the visitor sets in the rail
  // overrides that key, so the rail is a live control rather than decoration.
  const query = resolveLandingQuery(landing, parseQuery(await searchParams));
  const view = buildTable(await loadDriveRows(), query);

  const crumbs = crumbsFor(landing);

  return (
    <>
      <BreadcrumbJsonLd crumbs={crumbs} />
      <ItemListJsonLd view={view} name={landing.title} />
      <TablePage
        view={view}
        query={query}
        // The sub-id IS the slug: this is what attributes revenue to routes.
        subId={landing.slug}
        action={landingPath(landing)}
        heading={landing.title}
        intro={landing.intro}
        above={<Breadcrumb crumbs={crumbs} />}
        below={<RelatedViews landing={landing} />}
      />
    </>
  );
}
