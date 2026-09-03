import type { MetadataRoute } from 'next';
import { CHEAPEST_LANDING, LANDINGS, landingPath } from '@/lib/landings';
import { SITE_URL } from '@/lib/site';

/**
 * The sitemap lists the CURATED routes only.
 *
 * Filter permutations are deliberately absent. They are real, useful URLs for
 * a person who shares one, but there are combinatorially many of them and
 * submitting them would look exactly like doorway spam — the same reason
 * robots.ts disallows crawling them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, SITE_URL).toString();
  const lastModified = new Date();

  return [
    { url: url('/'), lastModified, changeFrequency: 'hourly', priority: 1 },
    {
      url: url(`/${CHEAPEST_LANDING.slug}`),
      lastModified,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    ...LANDINGS.map((landing) => ({
      url: url(landingPath(landing)),
      lastModified,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
