import Link from 'next/link';
import {
  CHEAPEST_LANDING,
  landingPath,
  landingsByCategory,
  type Landing,
} from '@/lib/landings';
import { AMAZON_ASSOCIATES_DISCLOSURE, SITE_NAME } from '@/lib/site';

/**
 * The global footer.
 *
 * Every curated landing is reachable from here (ticket 4.5), which is what
 * makes them crawlable without relying on the sitemap alone — an orphaned page
 * with no internal links is treated as low-value however good its content is.
 *
 * It also carries the affiliate disclosure. The Amazon Associates wording is
 * required verbatim by the Operating Agreement wherever Amazon prices appear,
 * which on this site is every page.
 */

function Column({ title, items }: { title: string; items: Landing[] }) {
  return (
    <div>
      <h2 className="footer__heading">{title}</h2>
      <ul className="footer__list">
        {items.map((landing) => (
          <li key={landing.slug}>
            <Link href={landingPath(landing)}>{landing.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const hdd = landingsByCategory('hdd');
  const ssd = landingsByCategory('ssd');

  return (
    <footer className="footer">
      <nav className="footer__columns" aria-label="All comparison views">
        <Column title="Hard drives" items={hdd.slice(0, Math.ceil(hdd.length / 2))} />
        <Column
          title="Hard drives, continued"
          items={hdd.slice(Math.ceil(hdd.length / 2))}
        />
        <Column title="Solid state" items={ssd.slice(0, Math.ceil(ssd.length / 2))} />
        <Column
          title="Solid state, continued"
          items={ssd.slice(Math.ceil(ssd.length / 2))}
        />
        <div>
          <h2 className="footer__heading">Everything</h2>
          <ul className="footer__list">
            <li>
              <Link href="/">All drives</Link>
            </li>
            <li>
              <Link href={`/${CHEAPEST_LANDING.slug}`}>{CHEAPEST_LANDING.label}</Link>
            </li>
          </ul>
        </div>
      </nav>

      <p className="footer__disclosure">
        {SITE_NAME} earns commission on purchases made through outbound links.{' '}
        {/* Required verbatim by the Associates Operating Agreement. */}
        {AMAZON_ASSOCIATES_DISCLOSURE} Prices come from marketplace APIs and are refreshed
        at least every 24 hours; a listing we cannot refresh is removed rather than shown
        stale. Always confirm the price on the retailer&rsquo;s site before buying.
      </p>
    </footer>
  );
}
