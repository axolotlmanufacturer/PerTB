import Link from 'next/link';
import { Breadcrumb, type Crumb } from '@/components/Seo';
import { SiteFooter } from '@/components/SiteFooter';
import { SITE_NAME } from '@/lib/site';

/**
 * The shell for pages that are prose rather than table: guides and the legal
 * set.
 *
 * Same masthead and same footer as the table, because the disclosure in that
 * footer has to appear on every page and a second shell is how it stops
 * appearing on one of them.
 */
export function PageShell({
  title,
  standfirst,
  crumbs,
  meta,
  children,
}: {
  title: string;
  standfirst?: string;
  crumbs: Crumb[];
  /** Small line under the standfirst — a date, a review notice. */
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="shell">
      <Breadcrumb crumbs={crumbs} />

      <header className="masthead">
        <h1 className="masthead__title">{title}</h1>
        <Link href="/" className="masthead__home">
          All drives · {SITE_NAME}
        </Link>
      </header>

      {standfirst && <p className="standfirst">{standfirst}</p>}
      {meta && <p className="page-meta">{meta}</p>}

      <article className="prose">{children}</article>

      <SiteFooter />
    </main>
  );
}
