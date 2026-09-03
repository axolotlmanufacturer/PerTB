import { describe, expect, it } from 'vitest';
import {
  CHEAPEST_LANDING,
  LANDINGS,
  findLanding,
  landingBaseQuery,
  landingPath,
  landingsByCategory,
  resolveLandingQuery,
  resolveRelated,
} from '@/lib/landings';
import { EMPTY_QUERY, parseQuery } from '@/lib/query';
import { buildTable, type DriveRow } from '@/lib/table';
import { AXIS_KEYS, type Axis } from '@/lib/taxonomy';

describe('the curated route set', () => {
  it('is capped at about 40 and is not a generated matrix', () => {
    // A full capacity x technology x interface matrix would be hundreds of
    // near-identical pages, which is what gets a domain classified as doorway
    // spam. Every route here is hand-written.
    const total = LANDINGS.length + 1; // + the cross-cutting route
    expect(total).toBeGreaterThanOrEqual(35);
    expect(total).toBeLessThanOrEqual(42);
  });

  it('has unique paths', () => {
    const paths = LANDINGS.map(landingPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every route its own title, description and intro', () => {
    const all = [...LANDINGS, CHEAPEST_LANDING];
    for (const key of ['title', 'description', 'intro'] as const) {
      const values = all.map((l) => l[key]);
      // Duplicated copy across routes is the definition of a thin page.
      expect(new Set(values).size, `duplicate ${key}`).toBe(values.length);
    }
  });

  it('writes copy substantial enough to be worth indexing', () => {
    for (const landing of [...LANDINGS, CHEAPEST_LANDING]) {
      expect(landing.title.length, landing.slug).toBeGreaterThan(20);
      expect(landing.description.length, landing.slug).toBeGreaterThan(60);
      expect(landing.intro.length, landing.slug).toBeGreaterThan(100);
      expect(landing.label.length, landing.slug).toBeGreaterThan(2);
    }
  });

  it('keeps titles within a length a SERP will actually show', () => {
    for (const landing of [...LANDINGS, CHEAPEST_LANDING]) {
      expect(landing.title.length, landing.slug).toBeLessThanOrEqual(70);
      expect(landing.description.length, landing.slug).toBeLessThanOrEqual(200);
    }
  });

  it('covers both categories and the axes the brief lists', () => {
    expect(landingsByCategory('hdd').length).toBeGreaterThan(10);
    expect(landingsByCategory('ssd').length).toBeGreaterThan(10);

    const slugs = new Set(LANDINGS.map((l) => l.slug));
    // Appendix C's named seeds.
    for (const required of [
      'nas',
      'used-enterprise',
      'shuckable',
      'sas',
      'external',
      'surveillance',
      'nvme-gen5',
      'm2-2230',
      'u2-enterprise',
      'sata-2-5',
      'portable',
    ]) {
      expect(slugs.has(required), `missing seed route: ${required}`).toBe(true);
    }
    expect(CHEAPEST_LANDING.slug).toBe('cheapest-per-tb');
  });

  it('only uses valid taxonomy keys in its filters', () => {
    for (const landing of [...LANDINGS, CHEAPEST_LANDING]) {
      for (const axis of [
        'technology',
        'formFactor',
        'interface',
        'condition',
      ] as Axis[]) {
        const values = landing.filters[axis] as readonly string[] | undefined;
        if (!values) continue;
        for (const value of values) {
          expect(
            (AXIS_KEYS[axis] as readonly string[]).includes(value),
            `${landing.slug}: ${axis}=${value}`,
          ).toBe(true);
        }
      }
    }
  });

  it('keeps capacity bands inside the publishable envelope', () => {
    for (const landing of LANDINGS) {
      const { capMin, capMax } = landing.filters;
      if (capMin !== undefined && capMin !== null) {
        expect(capMin, landing.slug).toBeGreaterThanOrEqual(0.12);
        expect(capMin, landing.slug).toBeLessThanOrEqual(40);
      }
      if (capMax !== undefined && capMax !== null) {
        expect(capMax, landing.slug).toBeLessThanOrEqual(40);
      }
      if (capMin != null && capMax != null) {
        expect(capMin, landing.slug).toBeLessThan(capMax);
      }
    }
  });
});

describe('cross-links', () => {
  it('resolves every related slug', () => {
    for (const landing of LANDINGS) {
      for (const slug of landing.related) {
        expect(
          resolveRelated(slug, landing.category),
          `${landing.slug} -> ${slug}`,
        ).toBeDefined();
      }
    }
    for (const slug of CHEAPEST_LANDING.related) {
      expect(resolveRelated(slug), `cheapest-per-tb -> ${slug}`).toBeDefined();
    }
  });

  it('prefers the linking page own category when a slug exists in both', () => {
    // "2tb" is a route under both categories; each should link to its own.
    expect(resolveRelated('2tb', 'hdd')?.category).toBe('hdd');
    expect(resolveRelated('2tb', 'ssd')?.category).toBe('ssd');
  });

  it('still resolves across categories when the slug is unique', () => {
    expect(resolveRelated('sata-2-5', 'hdd')?.category).toBe('ssd');
  });

  it('never links a page to itself', () => {
    for (const landing of LANDINGS) {
      const resolved = landing.related.map((s) => resolveRelated(s, landing.category));
      for (const target of resolved) {
        expect(
          target?.slug === landing.slug && target.category === landing.category,
          `${landing.slug} links to itself`,
        ).toBe(false);
      }
    }
  });

  it('gives every route at least two ways out', () => {
    for (const landing of LANDINGS) {
      expect(landing.related.length, landing.slug).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('landing queries', () => {
  it('resolves to a valid query', () => {
    for (const landing of LANDINGS) {
      const query = landingBaseQuery(landing);
      expect(query.includeShipping).toBe(true);
      expect(query.sort).toBe('ppt_asc');
    }
  });

  it('lets the visitor override an axis rather than intersecting it away', () => {
    const nas = findLanding('hdd', 'nas');
    expect(nas).toBeDefined();

    const withUserFilter = resolveLandingQuery(
      nas!,
      parseQuery(new URLSearchParams('condition=used')),
    );
    // The landing's own axes survive...
    expect(withUserFilter.technology).toEqual(['hdd_cmr']);
    // ...and the visitor's addition applies rather than emptying the page.
    expect(withUserFilter.condition).toEqual(['used']);
  });

  it('produces a different result set per route', () => {
    // Two routes that returned identical rows would be two thin pages.
    const rows: DriveRow[] = [
      makeRow({
        productId: 'a',
        technology: 'hdd_cmr',
        formFactor: '3.5',
        interface: 'sas12',
        capacityBytes: 16n * 10n ** 12n,
      }),
      makeRow({
        productId: 'b',
        technology: 'ssd_tlc',
        formFactor: 'm2_2280',
        interface: 'pcie5',
        capacityBytes: 2n * 10n ** 12n,
      }),
      makeRow({
        productId: 'c',
        technology: 'hdd_smr',
        formFactor: 'ext_desktop',
        interface: 'usb_g1',
        capacityBytes: 8n * 10n ** 12n,
        shuckable: true,
      }),
    ];

    const sas = buildTable(rows, landingBaseQuery(findLanding('hdd', 'sas')!));
    const gen5 = buildTable(rows, landingBaseQuery(findLanding('ssd', 'nvme-gen5')!));
    const shuck = buildTable(rows, landingBaseQuery(findLanding('hdd', 'shuckable')!));

    expect(sas.groups.map((g) => g.cheapest.productId)).toEqual(['a']);
    expect(gen5.groups.map((g) => g.cheapest.productId)).toEqual(['b']);
    expect(shuck.groups.map((g) => g.cheapest.productId)).toEqual(['c']);
  });
});

describe('paths', () => {
  it('builds the URL from category and slug', () => {
    expect(landingPath({ category: 'hdd', slug: 'nas' })).toBe('/hdd/nas');
    expect(landingPath({ category: 'ssd', slug: 'm2-2230' })).toBe('/ssd/m2-2230');
  });

  it('finds a landing only in its own category', () => {
    expect(findLanding('hdd', 'nas')).toBeDefined();
    expect(findLanding('ssd', 'nas')).toBeUndefined();
  });

  it('uses slugs that are URL-safe and readable', () => {
    for (const landing of [...LANDINGS, CHEAPEST_LANDING]) {
      expect(landing.slug, landing.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});

let seq = 0;
function makeRow(overrides: Partial<DriveRow>): DriveRow {
  seq++;
  return {
    offerId: `o${seq}`,
    productId: `p${seq}`,
    brand: 'Seagate',
    model: 'Exos',
    capacityBytes: 16n * 10n ** 12n,
    technology: 'hdd_cmr',
    formFactor: '3.5',
    interface: 'sata3',
    rpm: 7200,
    shuckable: false,
    shuckedEquivalent: null,
    marketplace: 'ebay',
    externalId: `e${seq}`,
    condition: 'used',
    lotSize: 1,
    priceCents: 10_000,
    shippingCents: 0,
    shippingIsCalculated: false,
    inStock: true,
    sellerName: null,
    sellerScore: null,
    powerOnHours: null,
    hasWarranty: null,
    returnPolicy: null,
    url: 'https://www.ebay.com/itm/1',
    ...overrides,
  };
}

describe('EMPTY_QUERY is the neutral base', () => {
  it('adds no filters of its own', () => {
    expect(EMPTY_QUERY.technology).toEqual([]);
    expect(EMPTY_QUERY.capMin).toBeNull();
  });
});
