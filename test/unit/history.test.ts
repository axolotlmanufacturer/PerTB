import { describe, expect, it } from 'vitest';
import {
  MIN_BADGE_DAYS,
  buildGroupHistory,
  daysBetween,
  sparklinePath,
  type HistoryIndex,
  type PriceObservation,
} from '@/lib/history';
import type { DriveRow } from '@/lib/table';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 31, 12, 0, 0);

function daysAgo(n: number): number {
  return NOW - n * DAY;
}

let seq = 0;
function row(overrides: Partial<DriveRow> = {}): DriveRow {
  seq++;
  return {
    offerId: `o${seq}`,
    productId: 'p1',
    brand: 'Seagate',
    model: 'Exos X18',
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
    priceCents: 16_000,
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

function index(
  entries: Record<string, [days: number, priceCents: number, shippingCents?: number][]>,
): HistoryIndex {
  const map = new Map<string, PriceObservation[]>();
  for (const [offerId, points] of Object.entries(entries)) {
    map.set(
      offerId,
      points.map(([days, priceCents, shippingCents = 0]): PriceObservation => ({
        at: daysAgo(days),
        priceCents,
        shippingCents,
      })),
    );
  }
  return map;
}

describe('buildGroupHistory', () => {
  it('is null when nothing was observed', () => {
    const a = row();
    expect(buildGroupHistory([a], new Map(), true, NOW)).toBeNull();
  });

  it('is null on a single observation rather than drawing a flat line', () => {
    // One point plus "now" would render as a straight line across ninety days.
    // For a listing first seen this morning that is a confident false claim.
    const a = row();
    const history = buildGroupHistory(
      [a],
      index({ [a.offerId]: [[0, 16_000]] }),
      true,
      NOW,
    );
    expect(history).toBeNull();
  });

  it('expresses the series in $/TB, not in dollars', () => {
    // $160 on a 16TB drive is $10/TB = 1000 cents/TB.
    const a = row({ capacityBytes: 16n * 10n ** 12n });
    const history = buildGroupHistory(
      [a],
      index({
        [a.offerId]: [
          [30, 32_000],
          [0, 16_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.highPptCents).toBeCloseTo(2000, 6);
    expect(history?.lowPptCents).toBeCloseTo(1000, 6);
  });

  it('divides a lot by its drive count, like the table does', () => {
    const a = row({ lotSize: 4, capacityBytes: 4n * 10n ** 12n });
    // $160 across 4 x 4TB = 16TB = $10/TB.
    const history = buildGroupHistory(
      [a],
      index({
        [a.offerId]: [
          [30, 32_000],
          [0, 16_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.lowPptCents).toBeCloseTo(1000, 6);
  });

  it('honours the shipping toggle', () => {
    const a = row({ capacityBytes: 10n * 10n ** 12n });
    const points = index({
      [a.offerId]: [
        [30, 10_000, 2_000],
        [0, 9_000, 2_000],
      ],
    });

    const withShipping = buildGroupHistory([a], points, true, NOW);
    const without = buildGroupHistory([a], points, false, NOW);

    expect(withShipping?.lowPptCents).toBeCloseTo(1100, 6);
    expect(without?.lowPptCents).toBeCloseTo(900, 6);
  });

  it('tracks the cheapest offer in the group, stepping between sellers', () => {
    // Two sellers. B undercuts A twenty days ago, so the group's price should
    // follow B from that point even though A never changed its own price.
    const a = row({ offerId: 'a', capacityBytes: 10n * 10n ** 12n });
    const b = row({ offerId: 'b', capacityBytes: 10n * 10n ** 12n });

    const history = buildGroupHistory(
      [a, b],
      index({
        a: [[40, 10_000]],
        b: [[20, 8_000]],
      }),
      true,
      NOW,
    );

    expect(history).not.toBeNull();
    // Before B existed the group was A's price; after, it is B's.
    expect(history?.highPptCents).toBeCloseTo(1000, 6);
    expect(history?.lowPptCents).toBeCloseTo(800, 6);
    expect(history?.series.at(-1)?.pptCents).toBeCloseTo(800, 6);
  });

  it('does not let an offer that did not exist yet drag the line down', () => {
    // B is cheaper, but only appeared 5 days ago. The series 40 days back must
    // be A's price, not B's.
    const a = row({ offerId: 'a', capacityBytes: 10n * 10n ** 12n });
    const b = row({ offerId: 'b', capacityBytes: 10n * 10n ** 12n });

    const history = buildGroupHistory(
      [a, b],
      index({
        a: [
          [40, 10_000],
          [30, 10_500],
        ],
        b: [[5, 4_000]],
      }),
      true,
      NOW,
    );

    expect(history?.series[0]?.pptCents).toBeCloseTo(1000, 6);
  });

  it('carries the last known price forward to now', () => {
    const a = row({ capacityBytes: 10n * 10n ** 12n });
    const history = buildGroupHistory(
      [a],
      index({
        [a.offerId]: [
          [40, 10_000],
          [30, 9_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.series.at(-1)?.at).toBe(NOW);
    expect(history?.series.at(-1)?.pptCents).toBeCloseTo(900, 6);
  });
});

describe('the cheapest-in-N-days badge', () => {
  const a = row({ offerId: 'badge', capacityBytes: 10n * 10n ** 12n });

  it('states the window it actually observed, not the window it looked in', () => {
    // 40 days of data must not produce a "cheapest in 90 days" claim.
    const history = buildGroupHistory(
      [a],
      index({
        badge: [
          [40, 12_000],
          [10, 9_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBe(40);
    expect(history?.depthDays).toBe(40);
  });

  it('says nothing at all below the minimum depth', () => {
    const history = buildGroupHistory(
      [a],
      index({
        badge: [
          [MIN_BADGE_DAYS - 1, 12_000],
          [0, 9_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history).not.toBeNull();
    expect(history?.cheapestInDays).toBeNull();
  });

  it('withholds the badge when the price never moved', () => {
    // Equal-lowest is technically true and useless. A price that has not moved
    // is not a deal, however low it is.
    const history = buildGroupHistory(
      [a],
      index({
        badge: [
          [40, 10_000],
          [20, 10_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBeNull();
  });

  it('withholds the badge when the current price is not the low', () => {
    const history = buildGroupHistory(
      [a],
      index({
        badge: [
          [40, 9_000],
          [10, 12_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBeNull();
  });

  it('awards it when the current price is the low of a window that moved', () => {
    const history = buildGroupHistory(
      [a],
      index({
        badge: [
          [60, 14_000],
          [30, 12_000],
          [2, 9_000],
        ],
      }),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBe(60);
    expect(history?.highPptCents).toBeCloseTo(1400, 6);
  });
});

describe('sparklinePath', () => {
  const series = [
    { at: daysAgo(30), pptCents: 1200 },
    { at: daysAgo(15), pptCents: 1000 },
    { at: daysAgo(0), pptCents: 1100 },
  ];

  it('is empty below two points', () => {
    expect(sparklinePath([], 72, 20)).toBe('');
    expect(sparklinePath([series[0]!], 72, 20)).toBe('');
  });

  it('spans the full width and starts with a move', () => {
    const d = sparklinePath(series, 72, 20, 1);
    expect(d.startsWith('M1.00 ')).toBe(true);
    const xs = [...d.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
    expect(xs.at(-1)).toBeCloseTo(71, 5);
    // x must increase with time or the line doubles back on itself.
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });

  it('puts the cheapest point at the bottom and the dearest at the top', () => {
    const d = sparklinePath(series, 72, 20, 1);
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    // SVG y grows downward: the 1000 (cheapest) point is the largest y.
    expect(ys[1]).toBeGreaterThan(ys[0]!);
    expect(ys[0]).toBeCloseTo(1, 5);
  });

  it('draws a flat series down the middle instead of dividing by zero', () => {
    const flat = [
      { at: daysAgo(10), pptCents: 1000 },
      { at: daysAgo(0), pptCents: 1000 },
    ];
    const d = sparklinePath(flat, 72, 20, 1);
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.every((y) => Math.abs(y - 10) < 0.01)).toBe(true);
  });
});

describe('daysBetween', () => {
  it('floors, and never goes negative', () => {
    expect(daysBetween(daysAgo(3), NOW)).toBe(3);
    expect(daysBetween(NOW, daysAgo(3))).toBe(0);
    expect(daysBetween(NOW - DAY - 1000, NOW)).toBe(1);
  });
});
