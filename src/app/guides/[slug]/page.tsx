import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { BreadcrumbJsonLd, type Crumb } from '@/components/Seo';
import { GUIDES, findGuide, guidePath } from '@/lib/guides';
import { CHEAPEST_LANDING, LANDINGS, landingPath } from '@/lib/landings';
import { SITE_NAME, SITE_URL } from '@/lib/site';

/**
 * One guide (ticket 7.1).
 *
 * The body is an .mdx file compiled at build time and rendered as a Server
 * Component — no MDX runtime reaches the browser. Only the curated slugs exist;
 * anything else is a 404 rather than a rendered shell.
 */

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = findGuide((await params).slug);
  if (!guide) return {};

  const path = guidePath(guide);
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: path },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: new URL(path, SITE_URL).toString(),
      siteName: SITE_NAME,
      type: 'article',
      publishedTime: guide.updated,
    },
  };
}

const DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** Resolve a related path to the label of the view it points at. */
function labelForPath(path: string): string {
  if (path === `/${CHEAPEST_LANDING.slug}`) return CHEAPEST_LANDING.label;
  const landing = LANDINGS.find((l) => landingPath(l) === path);
  return landing?.label ?? path;
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = findGuide(slug);
  if (!guide) notFound();

  // Static import by slug: generateStaticParams plus dynamicParams = false
  // means the set is closed at build time, so the bundler can resolve it.
  const { default: Body } = await import(`@/content/guides/${slug}.mdx`);

  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: '/' },
    { name: 'Guides', path: '/guides' },
    { name: guide.title, path: guidePath(guide) },
  ];

  return (
    <>
      <BreadcrumbJsonLd crumbs={crumbs} />
      <PageShell
        title={guide.title}
        standfirst={guide.summary}
        crumbs={crumbs}
        meta={<>Updated {DATE.format(new Date(guide.updated))}</>}
      >
        <Body />

        <nav aria-label="Related views" className="related">
          <h2 className="related__heading">Compare these now</h2>
          <ul className="related__list">
            {guide.related.map((path) => (
              <li key={path}>
                <Link href={path} className="related__link">
                  {labelForPath(path)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageShell>
    </>
  );
}
