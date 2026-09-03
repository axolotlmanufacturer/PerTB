import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { BreadcrumbJsonLd, type Crumb } from '@/components/Seo';
import { GUIDES, guidePath } from '@/lib/guides';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Storage Buying Guides',
  description:
    'How to read price per terabyte, why CMR and SMR matter for RAID, and what power-on hours tell you about a used enterprise drive.',
  alternates: { canonical: '/guides' },
  openGraph: {
    title: 'Storage Buying Guides',
    description:
      'How to read price per terabyte, why CMR and SMR matter for RAID, and what power-on hours tell you about a used enterprise drive.',
    url: new URL('/guides', SITE_URL).toString(),
    siteName: SITE_NAME,
    type: 'website',
  },
};

const CRUMBS: Crumb[] = [
  { name: SITE_NAME, path: '/' },
  { name: 'Guides', path: '/guides' },
];

export default function GuidesIndex() {
  return (
    <>
      <BreadcrumbJsonLd crumbs={CRUMBS} />
      <PageShell
        title="Guides"
        standfirst="Three things the table cannot tell you on its own."
        crumbs={CRUMBS}
      >
        <ul className="guide-list">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <h2>
                <Link href={guidePath(guide)}>{guide.title}</Link>
              </h2>
              <p>{guide.summary}</p>
            </li>
          ))}
        </ul>
      </PageShell>
    </>
  );
}
