import { describe, expect, it } from 'vitest';
import { EMPTY_QUERY, parseQuery, type Query } from '@/lib/query';
import {
  buildTable,
  dispersionPositions,
  passes,
  rowPricePerTbCents,
  type DriveRow,
} from '@/lib/table';
import { AXES } from '@/lib/taxonomy';

const TB = 1_000_000_000_000n;

let seq = 0;
function row(overrides: Partial<DriveRow> = {}): DriveRow {
  seq++;
  return {
    offerId: `o${seq}`,
    productId: `p${seq}`,
    brand: 'Seagate',
    model: 'Exos X16',
    capacityBytes: 16n * TB,
    technology: 'hdd_cmr',
    formFactor: '3.5',
    interface: 'sata3',
    rpm: 7200,
    shuckable: false,
    shuckedEquivalent: null,
    marketplace: 'ebay',
    condition: 'used',
    lotSize: 1,
    priceCents: 16_000,
    shippingCents: 0,
    shippingIsCalculated: false,
    inStock: true,
    sellerName: 'serverpartdeals',
    sellerScore: 99.4,
    powerOnHours: null,
    hasWarranty: null,
    returnPolicy: null,
    url: 'https://www.ebay.com/itm/1',
    ...overrides,
  };
}

const q = (search: string): Query => parseQuery(new URLSearchParams(search));

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

describe('facet independence (CLAUDE.md §3.5)', () => {
  const rows = [
    row({ interface: 'pcie4', technology: 'ssd_tlc', formFactor: 'm2_2280' }),
    row({ interface: 'pcie5', technology: 'ssd_tlc', formFactor: 'm2_2280' }),
    row({ interface: 'sata3', technology: 'hdd_cmr', formFactor: '3.5' }),
    row({ interface: 'sas12', technology: 'hdd_cmr', formFactor: '3.5' }),
  ];

  it('leaves the other options on a selected axis non-zero', () => {
    const view = buildTable(rows, q('interface=pcie4'));

    // The selection itself.
    expect(view.facetCounts.interface.pcie4).toBe(1);
    // The whole point: the siblings are still reachable.
    expect(view.facetCounts.interface.pcie5).toBe(1);
    expect(view.facetCounts.interface.sata3).toBe(1);
    expect(view.facetCounts.interface.sas12).toBe(1);
  });

  it('is what a naive implementation gets wrong', () => {
    // Counting the axis WITH its own filter applied — the bug — zeroes every
    // unselected option and the group becomes a radio button.
    const query = q('interface=pcie4');
    const naive = rows.filter((r) => passes(r, query, null));
    expect(naive.filter((r) => r.interface === 'pcie5')).toHaveLength(0);

    const correct = rows.filter((r) => passes(r, query, 'interface'));
    expect(correct.filter((r) => r.interface === 'pcie5')).toHaveLength(1);
  });

  it('still applies every OTHER axis when counting one', () => {
    // Selecting an SSD technology must reduce the interface counts, because
    // technology is not the skipped axis.
    const view = buildTable(rows, q('technology=ssd_tlc'));
    expect(view.facetCounts.interface.pcie4).toBe(1);
    expect(view.facetCounts.interface.sata3).toBeUndefined();
  });

  it('applies the boolean adjustments to every count, including the skipped axis', () => {
    const withLot = [
      ...rows,
      row({
        interface: 'pcie4',
        technology: 'ssd_tlc',
        formFactor: 'm2_2280',
        lotSize: 5,
      }),
    ];
    const view = buildTable(withLot, q('interface=sata3&hideLots=1'));
    // The lot is excluded from the pcie4 count even though interface is the
    // skipped axis — adjustments are never skipped.
    expect(view.facetCounts.interface.pcie4).toBe(1);
  });

  it('produces a count map for every axis', () => {
    const view = buildTable(rows, EMPTY_QUERY);
    for (const axis of AXES) {
      expect(view.facetCounts[axis], axis).toBeDefined();
    }
    expect(Object.keys(view.facetCounts)).toHaveLength(5);
  });
});

describe('passes', () => {
  it('respects the capacity range', () => {
    const small = row({ capacityBytes: 2n * TB });
    const large = row({ capacityBytes: 20n * TB });
    expect(passes(small, q('capMin=8'), null)).toBe(false);
    expect(passes(large, q('capMin=8'), null)).toBe(true);
    expect(passes(large, q('capMax=8'), null)).toBe(false);
  });

  it('measures capacity per drive, not per lot', () => {
    // A lot of five 4TB drives is not a 20TB drive, and must not answer a
    // capMin=8 filter.
    const lot = row({ capacityBytes: 4n * TB, lotSize: 5 });
    expect(passes(lot, q('capMin=8'), null)).toBe(false);
  });

  it('respects hideLots and inStockOnly', () => {
    expect(passes(row({ lotSize: 4 }), q('hideLots=1'), null)).toBe(false);
    expect(passes(row({ inStock: false }), q('inStock=1'), null)).toBe(false);
    expect(passes(row({ inStock: false }), q('inStock=0'), null)).toBe(true);
  });

  it('respects the shuckable filter as a tri-state', () => {
    const shuckable = row({ shuckable: true });
    expect(passes(shuckable, q('shuckable=1'), null)).toBe(true);
    expect(passes(shuckable, q('shuckable=0'), null)).toBe(false);
    expect(passes(shuckable, EMPTY_QUERY, null)).toBe(true);
  });

  it('never lets a null axis value satisfy a filter on that axis', () => {
    expect(passes(row({ interface: null }), q('interface=sata3'), null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Collapse
// ---------------------------------------------------------------------------

describe('duplicate collapse (CLAUDE.md §3.6)', () => {
  it('collapses six sellers of the same drive into one row showing the cheapest', () => {
    const rows = [22_000, 19_500, 21_000, 20_000, 23_000, 19_900].map((priceCents, i) =>
      row({ productId: 'exos16', offerId: `o${i}`, priceCents, condition: 'used' }),
    );

    const view = buildTable(rows, EMPTY_QUERY);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.offers).toHaveLength(6);
    expect(view.groups[0]?.cheapest.priceCents).toBe(19_500);
  });

  it('does NOT collapse across conditions', () => {
    // New and used of the same drive are different products to a buyer.
    const rows = [
      row({ productId: 'exos16', condition: 'new', priceCents: 30_000 }),
      row({ productId: 'exos16', condition: 'used', priceCents: 16_000 }),
      row({ productId: 'exos16', condition: 'renewed', priceCents: 22_000 }),
    ];
    const view = buildTable(rows, EMPTY_QUERY);
    expect(view.groups).toHaveLength(3);
  });

  it('orders offers within a group cheapest first', () => {
    const rows = [30_000, 10_000, 20_000].map((priceCents, i) =>
      row({ productId: 'x', offerId: `o${i}`, priceCents, condition: 'used' }),
    );
    const view = buildTable(rows, EMPTY_QUERY);
    const prices = view.groups[0]?.offers.map((o) => o.row.priceCents);
    expect(prices).toEqual([10_000, 20_000, 30_000]);
  });
});

// ---------------------------------------------------------------------------
// Pricing interaction
// ---------------------------------------------------------------------------

describe('the shipping toggle changes the ranking', () => {
  const postageLoaded = row({
    productId: 'a',
    priceCents: 99,
    shippingCents: 28_000,
    capacityBytes: 16n * TB,
  });
  const honest = row({
    productId: 'b',
    priceCents: 20_000,
    shippingCents: 0,
    capacityBytes: 16n * TB,
  });

  it('puts the postage-loaded listing on top when shipping is excluded', () => {
    const view = buildTable([postageLoaded, honest], q('shipping=0'));
    expect(view.groups[0]?.cheapest.productId).toBe('a');
  });

  it('puts the honest listing on top by default', () => {
    const view = buildTable([postageLoaded, honest], EMPTY_QUERY);
    expect(view.groups[0]?.cheapest.productId).toBe('b');
  });

  it('moves the floor price when toggled', () => {
    const included = buildTable([postageLoaded, honest], EMPTY_QUERY).floorPptCents;
    const excluded = buildTable([postageLoaded, honest], q('shipping=0')).floorPptCents;
    expect(excluded).toBeLessThan(included!);
  });
});

describe('lots and the floor', () => {
  it('hiding lots raises the floor when a lot was the cheapest', () => {
    const rows = [
      row({ productId: 'lot', capacityBytes: 4n * TB, lotSize: 5, priceCents: 26_000 }),
      row({ productId: 'single', capacityBytes: 16n * TB, priceCents: 24_000 }),
    ];

    const withLots = buildTable(rows, EMPTY_QUERY);
    const withoutLots = buildTable(rows, q('hideLots=1'));

    // The lot computes to $13.00/TB, the single to $15.00/TB.
    expect(withLots.floorPptCents).toBeCloseTo(1300, 0);
    expect(withoutLots.floorPptCents).toBeCloseTo(1500, 0);
    expect(withoutLots.floorPptCents!).toBeGreaterThan(withLots.floorPptCents!);
    expect(withoutLots.groups).toHaveLength(1);
  });

  it('divides a lot price across its drives', () => {
    const lot = row({ capacityBytes: 4n * TB, lotSize: 5, priceCents: 26_000 });
    expect(rowPricePerTbCents(lot, EMPTY_QUERY)).toBeCloseTo(1300, 6);
  });
});

describe('sorting', () => {
  const rows = [
    row({ productId: 'a', capacityBytes: 4n * TB, priceCents: 8_000 }),
    row({ productId: 'b', capacityBytes: 20n * TB, priceCents: 28_000 }),
    row({ productId: 'c', capacityBytes: 16n * TB, priceCents: 30_000 }),
  ];

  it('defaults to cheapest $/TB first', () => {
    const view = buildTable(rows, EMPTY_QUERY);
    const ppts = view.groups.map((g) => g.cheapestPptCents);
    expect([...ppts].sort((x, y) => x - y)).toEqual(ppts);
  });

  it('honours the other sort orders', () => {
    // a = $80/4TB = $20.00/TB, b = $280/20TB = $14.00/TB, c = $300/16TB = $18.75/TB
    const ids = (sort: string) =>
      buildTable(rows, q(`sort=${sort}`)).groups.map((g) => g.cheapest.productId);

    expect(ids('ppt_asc')).toEqual(['b', 'c', 'a']);
    expect(ids('ppt_desc')).toEqual(['a', 'c', 'b']);
    expect(ids('price_asc')).toEqual(['a', 'b', 'c']);
    expect(ids('capacity_desc')).toEqual(['b', 'c', 'a']);
  });
});

// ---------------------------------------------------------------------------
// Dispersion
// ---------------------------------------------------------------------------

describe('dispersion strip', () => {
  it('covers every live listing, not just the matched ones', () => {
    const rows = [row({ interface: 'sata3' }), row({ interface: 'pcie5' })];
    const view = buildTable(rows, q('interface=sata3'));
    expect(view.dispersion).toHaveLength(2);
    expect(view.dispersion.filter((d) => d.matched)).toHaveLength(1);
  });

  it('uses a log scale, so hard drives are not crushed into the left edge', () => {
    // $5/TB HDDs against a $500/TB Gen 5 SSD: two decades of range.
    const cheap = { pptCents: 500, matched: true };
    const mid = { pptCents: 5_000, matched: true };
    const dear = { pptCents: 50_000, matched: true };

    const [a, b, c] = dispersionPositions([cheap, mid, dear]);
    expect(a?.x).toBeCloseTo(0, 6);
    // On a linear scale the midpoint would sit at 0.09; on log it is central.
    expect(b?.x).toBeCloseTo(0.5, 6);
    expect(c?.x).toBeCloseTo(1, 6);
  });

  it('does not divide by zero when every listing is the same price', () => {
    const positions = dispersionPositions([
      { pptCents: 1000, matched: true },
      { pptCents: 1000, matched: false },
    ]);
    expect(positions.every((p) => Number.isFinite(p.x))).toBe(true);
    expect(positions[0]?.x).toBe(0.5);
  });

  it('returns nothing for an empty table', () => {
    expect(dispersionPositions([])).toEqual([]);
  });
});

describe('empty and degenerate inputs', () => {
  it('handles no rows at all', () => {
    const view = buildTable([], EMPTY_QUERY);
    expect(view.groups).toEqual([]);
    expect(view.floorPptCents).toBeNull();
    expect(view.matchedOffers).toBe(0);
    expect(view.totalOffers).toBe(0);
  });

  it('reports totals separately from matches', () => {
    const rows = [row({ interface: 'sata3' }), row({ interface: 'pcie5' })];
    const view = buildTable(rows, q('interface=sata3'));
    expect(view.totalOffers).toBe(2);
    expect(view.matchedOffers).toBe(1);
  });
});
