import { describe, expect, it } from 'vitest';
import { newestDate, rowLastChangedAt, viewLastModified } from '@/lib/freshness';
import { historyKey, type HistoryIndex, type PriceObservation } from '@/lib/history';
import { EMPTY_QUERY, type Query } from '@/lib/query';
import type { DriveRow } from '@/lib/table';

/**
 * The sitemap's `lastModified`.
 *
 * The bug this replaces was not a crash: `new Date()` produced a perfectly
 * well-formed sitemap that told the crawler all forty-one table routes changed
 * on every fetch. The tests here are about the DATE BEING TRUE, so most of
 * them assert what the value must NOT be.
 */

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
    externalId: `e${seq}`,
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
    firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function observation(at: string, over: Partial<PriceObservation> = {}): PriceObservation {
  return {
    at: new Date(at).getTime(),
    offerKey: 'ebay:1',
    lotSize: 1,
    priceCents: 16_000,
    shippingCents: 0,
    ...over,
  };
}

/** A history index for one group. */
function history(
  productId: string,
  condition: string,
  observations: PriceObservation[],
): HistoryIndex {
  return new Map([[historyKey(productId, condition), observations]]);
}

const EMPTY: HistoryIndex = new Map();

// ---------------------------------------------------------------------------
// rowLastChangedAt
// ---------------------------------------------------------------------------

describe('rowLastChangedAt', () => {
  it('falls back to when the listing was first seen', () => {
    const r = row({ firstSeenAt: new Date('2026-02-10T00:00:00Z') });
    expect(rowLastChangedAt(r, EMPTY)).toBe(Date.parse('2026-02-10T00:00:00Z'));
  });

  it('takes the newest price movement when there is one', () => {
    const r = row({ firstSeenAt: new Date('2026-02-10T00:00:00Z') });
    const h = history(r.productId, r.condition, [
      observation('2026-02-11T00:00:00Z'),
      observation('2026-03-01T00:00:00Z'),
    ]);
    expect(rowLastChangedAt(r, h)).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });

  it('does not depend on the observations arriving in order', () => {
    // loadPriceHistory sorts ascending, but a caller assembling an index by
    // hand must not silently get a wrong date out of this.
    const r = row({ firstSeenAt: new Date('2026-02-10T00:00:00Z') });
    const h = history(r.productId, r.condition, [
      observation('2026-03-01T00:00:00Z'),
      observation('2026-02-11T00:00:00Z'),
    ]);
    expect(rowLastChangedAt(r, h)).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });

  it('keeps first-seen when every observation predates it', () => {
    // History outlives the offer now, so a product can carry observations
    // older than the listing currently on sale.
    const r = row({ firstSeenAt: new Date('2026-04-01T00:00:00Z') });
    const h = history(r.productId, r.condition, [observation('2026-01-05T00:00:00Z')]);
    expect(rowLastChangedAt(r, h)).toBe(Date.parse('2026-04-01T00:00:00Z'));
  });

  it('does not read another condition’s history', () => {
    // new and used of the same drive are separate rows and separate groups.
    const r = row({ productId: 'p-shared', condition: 'used' });
    const h = history('p-shared', 'new', [observation('2026-06-01T00:00:00Z')]);
    expect(rowLastChangedAt(r, h)).toBe(r.firstSeenAt.getTime());
  });
});

// ---------------------------------------------------------------------------
// viewLastModified
// ---------------------------------------------------------------------------

describe('viewLastModified', () => {
  it('is null for an empty view, so the caller can omit the field', () => {
    expect(viewLastModified([], EMPTY, null)).toBeNull();
  });

  it('takes the newest change across the whole unfiltered table', () => {
    const rows = [
      row({ firstSeenAt: new Date('2026-01-02T00:00:00Z') }),
      row({ firstSeenAt: new Date('2026-05-20T00:00:00Z') }),
      row({ firstSeenAt: new Date('2026-03-11T00:00:00Z') }),
    ];
    expect(viewLastModified(rows, EMPTY, null)?.toISOString()).toBe(
      '2026-05-20T00:00:00.000Z',
    );
  });

  it('scores each view over its own rows, not the whole catalogue', () => {
    // The point of the whole module: /hdd/nas must not become fresh because
    // an NVMe listing appeared.
    const hdd = row({
      technology: 'hdd_cmr',
      firstSeenAt: new Date('2026-01-10T00:00:00Z'),
    });
    const nvme = row({
      technology: 'ssd_tlc',
      interface: 'pcie5',
      formFactor: 'm2_2280',
      firstSeenAt: new Date('2026-09-01T00:00:00Z'),
    });

    const hddOnly: Query = { ...EMPTY_QUERY, technology: ['hdd_cmr'] };
    const rows = [hdd, nvme];

    expect(viewLastModified(rows, EMPTY, hddOnly)?.toISOString()).toBe(
      '2026-01-10T00:00:00.000Z',
    );
    // ...while the unfiltered table does see the new listing.
    expect(viewLastModified(rows, EMPTY, null)?.toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('is null when the filter matches nothing, rather than dating an empty page', () => {
    const rows = [row({ technology: 'hdd_cmr' })];
    const ssdOnly: Query = { ...EMPTY_QUERY, technology: ['ssd_qlc'] };
    expect(viewLastModified(rows, EMPTY, ssdOnly)).toBeNull();
  });

  it('a price movement dates the view, not just a new listing', () => {
    const r = row({ firstSeenAt: new Date('2026-01-01T00:00:00Z') });
    const h = history(r.productId, r.condition, [observation('2026-07-04T00:00:00Z')]);
    expect(viewLastModified([r], h, null)?.toISOString()).toBe(
      '2026-07-04T00:00:00.000Z',
    );
  });

  it('never returns the current time for a catalogue that has not changed', () => {
    // The regression itself. Every row is months old; the answer must be old.
    const rows = [
      row({ firstSeenAt: new Date('2026-01-02T00:00:00Z') }),
      row({ firstSeenAt: new Date('2026-01-03T00:00:00Z') }),
    ];
    const answer = viewLastModified(rows, EMPTY, null);
    expect(answer).not.toBeNull();
    expect(Date.now() - answer!.getTime()).toBeGreaterThan(24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// newestDate — the editorial routes
// ---------------------------------------------------------------------------

describe('newestDate', () => {
  it('returns the newest of a set', () => {
    expect(newestDate(['2026-01-01', '2026-08-09', '2026-03-03'])?.toISOString()).toBe(
      new Date('2026-08-09').toISOString(),
    );
  });

  it('is null for an empty set', () => {
    expect(newestDate([])).toBeNull();
  });

  it('ignores an unparseable date rather than returning NaN', () => {
    expect(newestDate(['not a date', '2026-02-02'])?.toISOString()).toBe(
      new Date('2026-02-02').toISOString(),
    );
    expect(newestDate(['not a date'])).toBeNull();
  });
});
