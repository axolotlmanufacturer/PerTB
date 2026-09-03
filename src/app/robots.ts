import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Crawl the curated routes; do not crawl raw filter permutations.
 *
 * The facet rail can produce a very large number of valid URLs. They are good
 * URLs for a person to share, and terrible URLs for a crawler to enumerate:
 * near-duplicate pages at that scale get classified as doorway spam, and the
 * classification lands on the domain rather than the offending paths.
 *
 * The rule below blocks any path carrying a query string while leaving the
 * clean paths — which is exactly the curated set — crawlable. Landing pages
 * also declare the bare path as canonical, so a shared filtered URL still
 * consolidates onto its landing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // JSON for the client island, and the authenticated trigger.
          '/api/',
          // Every filter permutation. `/*?` matches any URL with a query string.
          '/*?',
        ],
      },
    ],
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
    host: SITE_URL,
  };
}
