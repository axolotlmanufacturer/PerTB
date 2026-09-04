import { describe, expect, it } from 'vitest';
import {
  MIN_BADGE_DAYS,
  buildGroupHistory,
  daysBetween,
  historyKey,
  sparklinePath,
  type PriceObservation,
} from '@/lib/history';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 31, 12, 0, 0);
const TB = 10n ** 12n;

function daysAgo(n: number): number {
  return NOW - n * DAY;
}

/**
 * Observations for one offer.
 *
 * `[daysAgo, priceCents, shippingCents?]`, plus the lot size the observation
 * was taken at — which lives on the PricePoint now, not on the offer, because
 * the offer may be gone by the time this is read.
 */
function obs(
  offerKey: string,
  points: [days: number, priceCents: number, shippingCents?: number][],
  lotSize = 1,
): PriceObservation[] {
  return points.map(([days, priceCents, shippingCents = 0]) => ({
    at: daysAgo(days),
    offerKey,
    lotSize,
    priceCents,
    shippingCents,
  }));
}

const TEN_TB = 10n * TB;

describe('buildGroupHistory', () => {
  it('is null when nothing was observed', () => {
    expect(buildGroupHistory(TEN_TB, [], true, NOW)).toBeNull();
  });

  it('is null on a single observation rather than drawing a flat line', () => {
    // One point plus "now" would render as a straight line across ninety days.
    // For a listing first seen this morning that is a confident false claim.
    expect(buildGroupHistory(TEN_TB, obs('a', [[0, 16_000]]), true, NOW)).toBeNull();
  });

  it('expresses the series in $/TB, not in dollars', () => {
    // $320 then $160 on a 16TB drive is $20/TB then $10/TB.
    const history = buildGroupHistory(
      16n * TB,
      obs('a', [
        [30, 32_000],
        [0, 16_000],
      ]),
      true,
      NOW,
    );
    expect(history?.highPptCents).toBeCloseTo(2000, 6);
    expect(history?.lowPptCents).toBeCloseTo(1000, 6);
  });

  it('divides by the lot size the observation was TAKEN at', () => {
    // $160 across 4 x 4TB = 16TB = $10/TB. The lot size rides on the point, so
    // a listing later re-read as a single drive does not retroactively rewrite
    // three months of history that were genuinely observed as a lot of four.
    const history = buildGroupHistory(
      4n * TB,
      obs(
        'a',
        [
          [30, 32_000],
          [0, 16_000],
        ],
        4,
      ),
      true,
      NOW,
    );
    expect(history?.lowPptCents).toBeCloseTo(1000, 6);
  });

  it('honours the shipping toggle', () => {
    const points = obs('a', [
      [30, 10_000, 2_000],
      [0, 9_000, 2_000],
    ]);

    expect(buildGroupHistory(TEN_TB, points, true, NOW)?.lowPptCents).toBeCloseTo(
      1100,
      6,
    );
    expect(buildGroupHistory(TEN_TB, points, false, NOW)?.lowPptCents).toBeCloseTo(
      900,
      6,
    );
  });

  it('tracks the cheapest offer in the group, stepping between sellers', () => {
    // Two sellers. B undercuts A twenty days ago, so the group's price should
    // follow B from that point even though A never changed its own price.
    const history = buildGroupHistory(
      TEN_TB,
      [...obs('a', [[40, 10_000]]), ...obs('b', [[20, 8_000]])],
      true,
      NOW,
    );

    expect(history).not.toBeNull();
    expect(history?.highPptCents).toBeCloseTo(1000, 6);
    expect(history?.lowPptCents).toBeCloseTo(800, 6);
    expect(history?.series.at(-1)?.pptCents).toBeCloseTo(800, 6);
  });

  it('does not let an offer that did not exist yet drag the line down', () => {
    const history = buildGroupHistory(
      TEN_TB,
      [
        ...obs('a', [
          [40, 10_000],
          [30, 10_500],
        ]),
        ...obs('b', [[5, 4_000]]),
      ],
      true,
      NOW,
    );
    expect(history?.series[0]?.pptCents).toBeCloseTo(1000, 6);
  });

  it('keeps the history of an offer that has since been deleted', () => {
    // The whole point of hanging PricePoint off the Product. Offer "sold" ended
    // twenty days ago and its row is gone; its prices were still real while it
    // was live, and dropping them would rewrite the past every time a listing
    // ends. Only "live" still exists, and it is the dearer of the two.
    const history = buildGroupHistory(
      TEN_TB,
      [
        ...obs('sold', [
          [60, 9_000],
          [40, 7_000],
        ]),
        ...obs('live', [[50, 12_000]]),
      ],
      true,
      NOW,
    );

    expect(history?.lowPptCents).toBeCloseTo(700, 6);
    expect(history?.depthDays).toBe(60);
  });

  it('carries the last known price forward to now', () => {
    const history = buildGroupHistory(
      TEN_TB,
      obs('a', [
        [40, 10_000],
        [30, 9_000],
      ]),
      true,
      NOW,
    );
    expect(history?.series.at(-1)?.at).toBe(NOW);
    expect(history?.series.at(-1)?.pptCents).toBeCloseTo(900, 6);
  });
});

describe('the cheapest-in-N-days badge', () => {
  it('states the window it actually observed, not the window it looked in', () => {
    // 40 days of data must not produce a "cheapest in 90 days" claim.
    const history = buildGroupHistory(
      TEN_TB,
      obs('badge', [
        [40, 12_000],
        [10, 9_000],
      ]),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBe(40);
    expect(history?.depthDays).toBe(40);
  });

  it('says nothing at all below the minimum depth', () => {
    const history = buildGroupHistory(
      TEN_TB,
      obs('badge', [
        [MIN_BADGE_DAYS - 1, 12_000],
        [0, 9_000],
      ]),
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
      TEN_TB,
      obs('badge', [
        [40, 10_000],
        [20, 10_000],
      ]),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBeNull();
  });

  it('withholds the badge when the current price is not the low', () => {
    const history = buildGroupHistory(
      TEN_TB,
      obs('badge', [
        [40, 9_000],
        [10, 12_000],
      ]),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBeNull();
  });

  it('awards it when the current price is the low of a window that moved', () => {
    const history = buildGroupHistory(
      TEN_TB,
      obs('badge', [
        [60, 14_000],
        [30, 12_000],
        [2, 9_000],
      ]),
      true,
      NOW,
    );
    expect(history?.cheapestInDays).toBe(60);
    expect(history?.highPptCents).toBeCloseTo(1400, 6);
  });
});

describe('historyKey', () => {
  it('groups by product AND condition, never across them', () => {
    // New and used of the same drive are different products to a buyer, so
    // they are different series (CLAUDE.md §3.6).
    expect(historyKey('p1', 'new')).not.toBe(historyKey('p1', 'used'));
    expect(historyKey('p1', 'used')).toBe('p1|used');
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
