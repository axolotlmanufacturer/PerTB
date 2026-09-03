import type { MetadataRoute } from 'next';
import { GUIDES, guidePath } from '@/lib/guides';
import { CHEAPEST_LANDING, LANDINGS, landingPath } from '@/lib/landings';
import { LEGAL_PAGES, legalPath } from '@/lib/legal';
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

    // Editorial changes when someone edits it, not when a price moves, so it
    // carries its own date rather than the crawl-time one.
    { url: url('/guides'), lastModified, changeFrequency: 'monthly', priority: 0.6 },
    ...GUIDES.map((guide) => ({
      url: url(guidePath(guide)),
      lastModified: new Date(guide.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),

    ...LEGAL_PAGES.map((page) => ({
      url: url(legalPath(page)),
      lastModified: new Date(page.updated),
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];
}
