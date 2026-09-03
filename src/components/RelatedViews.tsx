import Link from 'next/link';
import { landingPath, resolveRelated, type Landing } from '@/lib/landings';

/**
 * Cross-links between curated views (ticket 4.5).
 *
 * These are what turn 40 separate pages into a browsable set. A visitor who
 * lands on /hdd/16tb from a search should be one click from /hdd/nas and
 * /hdd/used-enterprise, and a crawler should see the same.
 */
export function RelatedViews({ landing }: { landing: Landing }) {
  const related = landing.related
    .map((slug) => resolveRelated(slug, landing.category))
    .filter((l): l is Landing => l !== undefined && l.slug !== landing.slug);

  if (related.length === 0) return null;

  return (
    <nav aria-label="Related views" style={wrapper}>
      <h2 style={heading}>Related</h2>
      <ul style={list}>
        {related.map((item) => (
          <li key={`${item.category}/${item.slug}`}>
            <Link href={landingPath(item)} style={chip}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const wrapper: React.CSSProperties = {
  marginTop: '1.5rem',
  paddingTop: '0.75rem',
  borderTop: '1px solid var(--border)',
};

const heading: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg-muted)',
  margin: '0 0 0.4rem',
};

const list: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const chip: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.15rem 0.45rem',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  fontSize: '12px',
  textDecoration: 'none',
};
