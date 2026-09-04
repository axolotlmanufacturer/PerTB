import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { BreadcrumbJsonLd, type Crumb } from '@/components/Seo';
import { LEGAL_PAGES, findLegalPage, legalPath } from '@/lib/legal';
import { SITE_NAME, SITE_URL } from '@/lib/site';

/**
 * Privacy, terms and the affiliate disclosure (ticket 7.3).
 *
 * These are drafts and the page says so, in a banner, above the text. The brief
 * asks for them to be drafted and flagged for legal review; a draft that does
 * not announce itself is worse than no page, because a visitor reasonably reads
 * a privacy policy as a commitment.
 */

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return LEGAL_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const page = findLegalPage((await params).slug);
  if (!page) return {};

  const path = legalPath(page);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      title: page.title,
      description: page.description,
      url: new URL(path, SITE_URL).toString(),
      siteName: SITE_NAME,
      type: 'article',
    },
  };
}

const DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export default async function LegalPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findLegalPage(slug);
  if (!page) notFound();

  const { default: Body } = await import(`@/content/legal/${slug}.mdx`);

  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: '/' },
    { name: page.title, path: legalPath(page) },
  ];

  return (
    <>
      <BreadcrumbJsonLd crumbs={crumbs} />
      <PageShell
        title={page.title}
        standfirst={page.summary}
        crumbs={crumbs}
        meta={<>Last updated {DATE.format(new Date(page.updated))}</>}
      >
        {page.needsReview && (
          <aside className="notice" role="note">
            <strong>Draft — not yet reviewed by a lawyer.</strong> This text was written
            to describe accurately what this software does, and it is a starting point,
            not advice. It has not been checked by anyone qualified and makes no claim to
            satisfy the law of any particular jurisdiction. Have it reviewed before this
            site takes real traffic.
          </aside>
        )}

        <Body />
      </PageShell>
    </>
  );
}
