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
    <nav aria-label="Related views" className="related">
      <h2 className="related__heading">Related</h2>
      <ul className="related__list">
        {related.map((item) => (
          <li key={`${item.category}/${item.slug}`}>
            <Link href={landingPath(item)} className="related__link">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
