import type { MetadataRoute } from 'next';
import { newestDate, viewLastModified } from '@/lib/freshness';
import { GUIDES, guidePath } from '@/lib/guides';
import {
  CHEAPEST_LANDING,
  LANDINGS,
  landingBaseQuery,
  landingPath,
} from '@/lib/landings';
import { LEGAL_PAGES, legalPath } from '@/lib/legal';
import { loadDriveRows, loadPriceHistory } from '@/lib/offers';
import { SITE_URL } from '@/lib/site';

/**
 * The sitemap lists the CURATED routes only.
 *
 * Filter permutations are deliberately absent. They are real, useful URLs for
 * a person who shares one, but there are combinatorially many of them and
 * submitting them would look exactly like doorway spam — the same reason
 * robots.ts disallows crawling them.
 *
 * `lastModified` is derived, never stamped with the crawl time. See
 * freshness.ts for why that distinction is load-bearing and what the derived
 * date can and cannot prove. A route we cannot date honestly carries no date:
 * the field is optional in the protocol, and omitting it is strictly better
 * than filling it with `now`.
 *
 * Two reads, both already indexed and both used by every table page, so this
 * costs the same as rendering one landing.
 */
export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => new URL(path, SITE_URL).toString();
  const now = new Date();

  const [rows, history] = await Promise.all([loadDriveRows(now), loadPriceHistory(now)]);

  /** undefined, not `now` — see the note above. */
  const tableDate = (query: Parameters<typeof viewLastModified>[2]) =>
    viewLastModified(rows, history, query) ?? undefined;

  // The unfiltered table and the cheapest view both show every live row, so
  // they share the whole catalogue's date.
  const wholeCatalogue = tableDate(null);

  return [
    {
      url: url('/'),
      lastModified: wholeCatalogue,
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: url(`/${CHEAPEST_LANDING.slug}`),
      lastModified: wholeCatalogue,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    ...LANDINGS.map((landing) => ({
      url: url(landingPath(landing)),
      // Scored over the rows this landing actually shows: /hdd/nas does not
      // become fresh because an NVMe price moved.
      lastModified: tableDate(landingBaseQuery(landing)),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),

    // Editorial changes when someone edits it, not when a price moves, so it
    // carries its own date. The index is as new as its newest entry.
    {
      url: url('/guides'),
      lastModified: newestDate(GUIDES.map((guide) => guide.updated)) ?? undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
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
