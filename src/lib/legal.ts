/**
 * The legal set (ticket 7.3).
 *
 * These are DRAFTS. They were written to be a sound starting point and to say
 * accurately what this software actually does — which is the part a lawyer
 * cannot supply and the operator can — but they have not been reviewed by
 * anyone qualified, they make no claim to cover any particular jurisdiction,
 * and nothing in this repository is legal advice.
 *
 * `needsReview` drives a banner that says exactly that on the page itself. Do
 * not remove it because the pages look finished. Remove it when a lawyer has
 * actually read them.
 */

export interface LegalPage {
  slug: string;
  title: string;
  description: string;
  summary: string;
  updated: string;
  /** Shows the "not yet reviewed" banner. */
  needsReview: boolean;
}

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: 'affiliate-disclosure',
    title: 'Affiliate Disclosure',
    description:
      'How this site makes money, what that does and does not change about the rankings, and the disclosures the affiliate programmes require.',
    summary:
      'Every outbound link here is affiliate-tagged. This page says what that means for the numbers you are reading.',
    updated: '2026-09-03',
    needsReview: true,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description:
      'What this site collects, what it does not, and what the affiliate networks set when you click through to a marketplace.',
    summary:
      'There are no accounts and no passwords here. This page describes the data that does move, most of which belongs to the marketplaces rather than to us.',
    updated: '2026-09-03',
    needsReview: true,
  },
  {
    slug: 'terms',
    title: 'Terms of Use',
    description:
      'The terms on which this comparison table is offered, and the limits of what a price snapshot can promise.',
    summary:
      'Short version: the prices here come from marketplace APIs, they go stale, and the retailer’s own page is always the authority.',
    updated: '2026-09-03',
    needsReview: true,
  },
];

export function findLegalPage(slug: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.slug === slug);
}

export function legalPath(page: Pick<LegalPage, 'slug'>): string {
  return `/legal/${page.slug}`;
}
