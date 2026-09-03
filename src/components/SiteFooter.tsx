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
      <h2 style={heading}>{title}</h2>
      <ul style={list}>
        {items.map((landing) => (
          <li key={landing.slug}>
            <Link href={landingPath(landing)} style={link}>
              {landing.label}
            </Link>
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
    <footer style={footer}>
      <nav style={columns} aria-label="All comparison views">
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
          <h2 style={heading}>Everything</h2>
          <ul style={list}>
            <li>
              <Link href="/" style={link}>
                All drives
              </Link>
            </li>
            <li>
              <Link href={`/${CHEAPEST_LANDING.slug}`} style={link}>
                {CHEAPEST_LANDING.label}
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <p style={disclosure}>
        {SITE_NAME} earns commission on purchases made through outbound links.{' '}
        {/* Required verbatim by the Associates Operating Agreement. */}
        {AMAZON_ASSOCIATES_DISCLOSURE} Prices come from marketplace APIs and are refreshed
        at least every 24 hours; a listing we cannot refresh is removed rather than shown
        stale. Always confirm the price on the retailer&rsquo;s site before buying.
      </p>
    </footer>
  );
}

const footer: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  marginTop: '2rem',
  paddingTop: '1rem',
  fontSize: '12px',
};

const columns: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '1rem',
  marginBottom: '1rem',
};

const heading: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  margin: '0 0 0.3rem',
  color: 'var(--fg-muted)',
};

const list: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '0.15rem',
};

const link: React.CSSProperties = { textDecoration: 'none' };

const disclosure: React.CSSProperties = {
  color: 'var(--fg-muted)',
  maxWidth: '70ch',
  margin: 0,
  paddingBottom: '1rem',
};
