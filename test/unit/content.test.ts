import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GUIDES, findGuide, guidePath } from '@/lib/guides';
import { CHEAPEST_LANDING, LANDINGS, landingPath } from '@/lib/landings';
import { LEGAL_PAGES, findLegalPage, legalPath } from '@/lib/legal';
import { proposeDictionaryEntry } from '@/lib/quarantine';
import { AMAZON_ASSOCIATES_DISCLOSURE, OUTBOUND_LINK_REL } from '@/lib/site';

/**
 * Phase 7 — editorial and compliance.
 *
 * The disclosure assertions here are the ones that cost money to get wrong: the
 * Associates Operating Agreement requires its wording verbatim, and a broken
 * internal link inside a guide is a page that leaks its own traffic.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

function readContent(dir: string, slug: string): string {
  return readFileSync(`${root}/src/content/${dir}/${slug}.mdx`, 'utf8');
}

/** Every internal path this site is prepared to serve. */
const KNOWN_PATHS = new Set<string>([
  '/',
  '/guides',
  `/${CHEAPEST_LANDING.slug}`,
  ...LANDINGS.map(landingPath),
  ...GUIDES.map(guidePath),
  ...LEGAL_PAGES.map(legalPath),
]);

describe('the guides', () => {
  it('has the three the brief names', () => {
    expect(GUIDES).toHaveLength(3);
    expect(GUIDES.map((g) => g.slug).sort()).toEqual([
      'cmr-vs-smr-and-raid',
      'how-to-read-price-per-terabyte',
      'used-enterprise-drives-power-on-hours',
    ]);
  });

  it('gives every guide indexable metadata', () => {
    for (const guide of GUIDES) {
      expect(guide.title.length, guide.slug).toBeGreaterThan(15);
      expect(guide.title.length, guide.slug).toBeLessThanOrEqual(70);
      expect(guide.description.length, guide.slug).toBeGreaterThan(60);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(200);
      expect(guide.summary.length, guide.slug).toBeGreaterThan(80);
      expect(guide.slug, guide.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(Number.isNaN(Date.parse(guide.updated)), guide.slug).toBe(false);
    }
  });

  it('writes substantially rather than restating the table', () => {
    // A guide shorter than this is a landing page with extra steps.
    for (const guide of GUIDES) {
      const body = readContent('guides', guide.slug);
      expect(body.split(/\s+/).length, guide.slug).toBeGreaterThan(400);
      expect(body, guide.slug).toMatch(/^##\s/m);
    }
  });

  it('sends readers back into the comparison views', () => {
    for (const guide of GUIDES) {
      expect(guide.related.length, guide.slug).toBeGreaterThanOrEqual(3);
      for (const path of guide.related) {
        expect(KNOWN_PATHS.has(path), `${guide.slug} -> ${path}`).toBe(true);
      }
    }
  });

  it('has no dead internal links in the prose', () => {
    for (const guide of GUIDES) {
      const body = readContent('guides', guide.slug);
      for (const [, path] of body.matchAll(/\]\((\/[^)#]*)\)/g)) {
        expect(KNOWN_PATHS.has(path!), `${guide.slug} -> ${path}`).toBe(true);
      }
    }
  });

  it('resolves a slug only when it exists', () => {
    expect(findGuide('cmr-vs-smr-and-raid')).toBeDefined();
    expect(findGuide('nope')).toBeUndefined();
    expect(guidePath({ slug: 'x' })).toBe('/guides/x');
  });
});

describe('the legal set', () => {
  it('covers privacy, terms and a dedicated affiliate disclosure', () => {
    expect(LEGAL_PAGES.map((p) => p.slug).sort()).toEqual([
      'affiliate-disclosure',
      'privacy',
      'terms',
    ]);
  });

  it('is flagged for legal review, on every page', () => {
    // A draft privacy policy that does not announce itself is worse than none:
    // a visitor reads it as a commitment.
    for (const page of LEGAL_PAGES) {
      expect(page.needsReview, page.slug).toBe(true);
    }
  });

  it('carries the Amazon Associates wording verbatim in the disclosure', () => {
    const body = readContent('legal', 'affiliate-disclosure');
    expect(body).toContain(AMAZON_ASSOCIATES_DISCLOSURE);
  });

  it('names the eBay Partner Network too', () => {
    // Two programmes, two disclosures. The Amazon one is the only one whose
    // wording is dictated, but omitting eBay entirely is still a gap.
    const body = readContent('legal', 'affiliate-disclosure');
    expect(body).toMatch(/eBay Partner Network/i);
  });

  it('states that commission does not change the ranking', () => {
    const body = readContent('legal', 'affiliate-disclosure');
    expect(body).toMatch(/rank/i);
    expect(body).toMatch(/same price/i);
  });

  it('tells people the price is a snapshot', () => {
    const body = readContent('legal', 'terms');
    expect(body).toMatch(/may not be the price you pay/i);
  });

  it('says there are no accounts and no passwords', () => {
    const body = readContent('legal', 'privacy');
    expect(body).toMatch(/no accounts and no passwords/i);
  });

  it('has no dead internal links', () => {
    for (const page of LEGAL_PAGES) {
      const body = readContent('legal', page.slug);
      for (const [, path] of body.matchAll(/\]\((\/[^)#]*)\)/g)) {
        expect(KNOWN_PATHS.has(path!), `${page.slug} -> ${path}`).toBe(true);
      }
    }
  });

  it('resolves a slug only when it exists', () => {
    expect(findLegalPage('privacy')).toBeDefined();
    expect(findLegalPage('nope')).toBeUndefined();
    expect(legalPath({ slug: 'terms' })).toBe('/legal/terms');
  });
});

describe('the outbound link rel (ticket 7.5)', () => {
  it('is exactly nofollow sponsored noopener', () => {
    // nofollow and sponsored are the disclosure search engines read; noopener
    // closes the reverse-tabnabbing hole on target="_blank". Dropping any of
    // the three is a compliance change disguised as a tidy-up.
    expect(OUTBOUND_LINK_REL).toBe('nofollow sponsored noopener');
  });
});

describe('the proposed dictionary entry (ticket 7.2)', () => {
  it('is valid JSON with the fields the loader requires', () => {
    const entry = JSON.parse(
      proposeDictionaryEntry({
        brand: 'Seagate',
        model: 'Exos X24',
        technology: 'hdd_cmr',
        formFactor: '3.5',
        interface: 'sata3',
      }),
    ) as Record<string, unknown>;

    expect(entry.id).toBe('seagate-exos-x24');
    expect(entry.brand).toBe('Seagate');
    expect(entry.family).toBe('Exos X24');
    expect(entry.match).toEqual(['exos x24']);
    expect(entry.technology).toBe('hdd_cmr');
    expect(entry.confidence).toBe(0.9);
    expect(entry.note).toMatch(/verify/i);
  });

  it('strips a parenthetical from the match term', () => {
    // Match strings are compiled with every regex metacharacter escaped, so
    // "wd blue (hdd)" would only match a title that spells the bracket out.
    const entry = JSON.parse(
      proposeDictionaryEntry({ brand: 'Western Digital', model: 'WD Blue (HDD)' }),
    ) as Record<string, unknown>;

    expect(entry.match).toEqual(['wd blue']);
    // The family keeps its full name; only the pattern is trimmed.
    expect(entry.family).toBe('WD Blue (HDD)');
  });

  it('omits an axis the reviewer left unknown rather than emitting null', () => {
    // A null in the dictionary would be an assertion that the axis is
    // unresolvable, which is a different and much stronger claim.
    const entry = JSON.parse(
      proposeDictionaryEntry({ brand: 'Acme', model: 'Superdrive', technology: null }),
    ) as Record<string, unknown>;

    expect('technology' in entry).toBe(false);
    expect('formFactor' in entry).toBe(false);
  });
});
