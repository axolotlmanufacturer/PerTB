/**
 * The editorial set (ticket 7.1).
 *
 * Hand-written, like the landing routes and for the same reason: a guide exists
 * to answer a question the table cannot answer on its own, and there are only a
 * handful of those. Volume here is not a goal — three articles that a NAS
 * builder would actually forward to someone beat thirty that restate the table
 * in prose.
 *
 * Metadata lives here rather than in MDX frontmatter so it is typed, testable,
 * and available to the index page and the sitemap without parsing every file.
 */

export interface Guide {
  slug: string;
  title: string;
  /** Meta description. One sentence, written for a SERP. */
  description: string;
  /** The standfirst on the index page and at the top of the article. */
  summary: string;
  /** ISO date. Shown, because storage advice ages. */
  updated: string;
  /** Comparison views this guide sends people to. */
  related: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-read-price-per-terabyte',
    title: 'How to Read Price per Terabyte',
    description:
      'What $/TB does and does not tell you, why shipping belongs inside the number, and the three ways the figure gets quoted wrong.',
    summary:
      'The only honest way to compare a 2TB SSD against a 20TB hard drive is per terabyte — and the number is easy to quote in a way that is arithmetically correct and practically useless.',
    updated: '2026-09-03',
    related: ['/cheapest-per-tb', '/hdd/homelab', '/ssd/2tb'],
  },
  {
    slug: 'cmr-vs-smr-and-raid',
    title: 'CMR vs SMR, and Why It Matters for RAID',
    description:
      'Shingled drives can take days to finish a RAID rebuild and some controllers drop them mid-resilver. How to tell which one you are buying.',
    summary:
      'Shingled recording buys density by overlapping tracks, which makes random writes catastrophically slow. In an array that is not a performance footnote — it is the difference between a rebuild that finishes and one that does not.',
    updated: '2026-09-03',
    related: ['/hdd/nas', '/hdd/cmr', '/hdd/smr'],
  },
  {
    slug: 'used-enterprise-drives-power-on-hours',
    title: 'Buying Used Enterprise Drives: What Power-On Hours Tell You',
    description:
      'Datacentre pulls hold the lowest $/TB on the market. What 45,000 hours actually means, and which SMART figures matter more.',
    summary:
      'Used enterprise drives are where the genuinely lowest $/TB sits, and the trade is real. Power-on hours are the number everyone quotes and not the number that should worry you most.',
    updated: '2026-09-03',
    related: ['/hdd/used-enterprise', '/hdd/sas', '/hdd/recertified'],
  },
];

export function findGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function guidePath(guide: Pick<Guide, 'slug'>): string {
  return `/guides/${guide.slug}`;
}
