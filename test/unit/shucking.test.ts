import { describe, expect, it } from 'vitest';
import { EMPTY_QUERY, type Query } from '@/lib/query';
import { buildTable, type DriveRow } from '@/lib/table';

/**
 * The shucking delta — CLAUDE.md §3.8, ticket 5.4.
 *
 * The insight is that a WD Elements 20TB routinely undercuts the bare drive
 * inside it. The number that makes that claim checkable is the delta, and the
 * delta is only honest if the comparator is a drive somebody could actually
 * buy instead, at the same capacity, today.
 */

const TB = 10n ** 12n;

let seq = 0;
function row(overrides: Partial<DriveRow> = {}): DriveRow {
  seq++;
  return {
    offerId: `o${seq}`,
    productId: `p${seq}`,
    brand: 'WD',
    model: 'Elements Desktop',
    capacityBytes: 20n * TB,
    technology: 'hdd_cmr',
    formFactor: '3.5',
    interface: 'sata3',
    rpm: 7200,
    shuckable: false,
    shuckedEquivalent: null,
    marketplace: 'ebay',
    externalId: `e${seq}`,
    condition: 'new',
    lotSize: 1,
    priceCents: 20_000,
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

function external(overrides: Partial<DriveRow> = {}): DriveRow {
  return row({
    brand: 'WD',
    model: 'Elements Desktop',
    shuckable: true,
    shuckedEquivalent: 'WD white-label 3.5-inch CMR',
    formFactor: 'ext_desktop',
    interface: 'usb_g1',
    ...overrides,
  });
}

function bare(overrides: Partial<DriveRow> = {}): DriveRow {
  return row({
    brand: 'Seagate',
    model: 'Exos X20',
    shuckable: false,
    formFactor: '3.5',
    interface: 'sata3',
    ...overrides,
  });
}

const shuckableOnly: Query = { ...EMPTY_QUERY, shuckable: true };

function firstGroup(rows: DriveRow[], query: Query = EMPTY_QUERY) {
  return buildTable(rows, query).groups[0];
}

describe('the external-vs-bare delta', () => {
  it('is signed, and positive when shucking is the cheaper route', () => {
    // $200 for 20TB external = $10/TB; $260 for the bare 20TB = $13/TB.
    const rows = [external({ priceCents: 20_000 }), bare({ priceCents: 26_000 })];
    const group = firstGroup(rows, shuckableOnly);

    expect(group?.shuck?.savingPptCents).toBeCloseTo(300, 6);
    expect(group?.shuck?.barePptCents).toBeCloseTo(1300, 6);
    expect(group?.shuck?.bareLabel).toBe('Seagate Exos X20');
  });

  it('goes negative when the enclosure is the more expensive route', () => {
    // The received wisdom is that shucking always wins. Half the value of this
    // column is the rows where it does not.
    const rows = [external({ priceCents: 30_000 }), bare({ priceCents: 26_000 })];
    const group = firstGroup(rows, shuckableOnly);

    expect(group?.shuck?.savingPptCents).toBeLessThan(0);
  });

  it('survives the shuckable filter that the landing route applies', () => {
    // /hdd/shuckable filters bare drives OUT of the table. Drawing the
    // comparison from the surviving rows would quietly turn it into "cheapest
    // other enclosure", which is not a comparison anyone wants.
    const rows = [external({ priceCents: 20_000 }), bare({ priceCents: 26_000 })];

    const filtered = buildTable(rows, shuckableOnly);
    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups[0]?.shuck?.barePptCents).toBeCloseTo(1300, 6);
  });

  it('is null when no bare drive of that capacity is live', () => {
    // Not a fallback to a different capacity. "No comparison available" is a
    // true statement; a comparison against a 16TB drive is not.
    const rows = [external({ priceCents: 20_000 }), bare({ capacityBytes: 16n * TB })];
    expect(firstGroup(rows, shuckableOnly)?.shuck).toBeNull();
  });

  it('compares like with like on condition', () => {
    const rows = [
      external({ priceCents: 20_000, condition: 'new' }),
      bare({ priceCents: 12_000, condition: 'used' }),
    ];
    expect(firstGroup(rows, shuckableOnly)?.shuck).toBeNull();
  });

  it('ignores a multi-drive lot as the comparator', () => {
    // A lot of five is not the purchase the shucker is weighing up.
    const rows = [
      external({ priceCents: 20_000 }),
      bare({ priceCents: 100_000, lotSize: 5 }),
    ];
    expect(firstGroup(rows, shuckableOnly)?.shuck).toBeNull();
  });

  it('ignores an out-of-stock comparator', () => {
    const rows = [
      external({ priceCents: 20_000 }),
      bare({ priceCents: 26_000, inStock: false }),
    ];
    expect(firstGroup(rows, shuckableOnly)?.shuck).toBeNull();
  });

  it('takes the CHEAPEST bare drive when several are live', () => {
    const rows = [
      external({ priceCents: 20_000 }),
      bare({ priceCents: 30_000, model: 'Ultrastar DC HC560' }),
      bare({ priceCents: 24_000, model: 'Exos X20' }),
    ];
    const group = firstGroup(rows, shuckableOnly);
    expect(group?.shuck?.barePptCents).toBeCloseTo(1200, 6);
    expect(group?.shuck?.bareLabel).toBe('Seagate Exos X20');
  });

  it('follows the shipping toggle, like every other number on the page', () => {
    const rows = [
      external({ priceCents: 20_000 }),
      bare({ priceCents: 24_000, shippingCents: 4_000 }),
    ];

    const included = firstGroup(rows, shuckableOnly);
    const excluded = firstGroup(rows, { ...shuckableOnly, includeShipping: false });

    expect(included?.shuck?.barePptCents).toBeCloseTo(1400, 6);
    expect(excluded?.shuck?.barePptCents).toBeCloseTo(1200, 6);
  });

  it('is null for a bare drive — nothing to shuck', () => {
    expect(firstGroup([bare()])?.shuck).toBeNull();
  });
});
