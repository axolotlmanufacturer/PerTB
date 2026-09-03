import { pricePerTbCents } from './pricing';
import type { DriveRow } from './table';

/**
 * Price history — the 90-day window behind the sparkline column and the
 * "cheapest in N days" badge (tickets 5.1, 5.2).
 *
 * Two things here are load-bearing.
 *
 * First, history is expressed in $/TB, not in dollars, and it is derived here
 * from the stored priceCents/shippingCents exactly as pricing.ts derives the
 * live figure. A sparkline of raw price would be a different metric from the
 * column it sits next to, and a drive whose price held while its lot size was
 * re-read would draw a flat line under a moving number.
 *
 * Second, the badge states the window it actually observed. See
 * `cheapestInDays` — claiming "cheapest in 90 days" on eleven days of data is
 * a wrong number in the sense that matters (CLAUDE.md §1.1): the arithmetic is
 * right and the sentence is false.
 */

/** The window the brief specifies. Nothing older is loaded for display. */
export const HISTORY_WINDOW_DAYS = 90;

/**
 * Below this depth no "cheapest in N days" claim is made at all.
 *
 * A drive first seen yesterday is trivially at its cheapest-ever price, and
 * saying so is a recommendation dressed up as an observation.
 */
export const MIN_BADGE_DAYS = 7;

/** $/TB comparisons are floating point; treat differences below this as equal. */
const EPSILON = 1e-6;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One stored observation of an offer's price. */
export interface PriceObservation {
  /** Epoch milliseconds. */
  at: number;
  priceCents: number;
  shippingCents: number;
}

/** offerId → observations, oldest first. */
export type HistoryIndex = ReadonlyMap<string, readonly PriceObservation[]>;

export interface SeriesPoint {
  at: number;
  pptCents: number;
}

export interface GroupHistory {
  /**
   * The cheapest $/TB available for this (product, condition) at each point in
   * the window, oldest first.
   */
  series: SeriesPoint[];
  /** How far back the observations actually reach, in whole days. */
  depthDays: number;
  lowPptCents: number;
  highPptCents: number;
  /** When the window's high was observed, for the badge's title text. */
  highAt: number;
  /**
   * Set only when the current price is the lowest in the observed window AND
   * that window is deep enough to be worth a claim. The number is the REAL
   * depth, so the badge reads "cheapest in 34 days" on 34 days of data.
   */
  cheapestInDays: number | null;
}

/**
 * The $/TB an offer was at, at each of its observations.
 *
 * Capacity and lot size come from the offer as it stands now. If normalisation
 * later re-reads a listing as a lot of four, its whole history re-scales — and
 * that is correct, because the old figure was wrong.
 */
function offerSeries(
  row: DriveRow,
  observations: readonly PriceObservation[],
  includeShipping: boolean,
): SeriesPoint[] {
  return observations
    .map((observation) => ({
      at: observation.at,
      pptCents: pricePerTbCents(
        {
          capacityBytes: row.capacityBytes,
          lotSize: row.lotSize,
          priceCents: observation.priceCents,
          shippingCents: observation.shippingCents,
        },
        includeShipping,
      ),
    }))
    .sort((a, b) => a.at - b.at);
}

/**
 * The cheapest $/TB across a group's offers over time.
 *
 * A PricePoint is written only when a price changes, so each offer's series is
 * a step function: its price at time t is its last observation at or before t.
 * The group's price at t is the minimum of those steps across the offers that
 * existed by then — which is the number the table row shows, so it is the
 * number the sparkline has to draw. Tracking only the currently-cheapest offer
 * would draw a line that never explains why the row's price moved when a
 * different seller undercut it.
 */
export function buildGroupHistory(
  rows: readonly DriveRow[],
  index: HistoryIndex,
  includeShipping: boolean,
  now: number = Date.now(),
): GroupHistory | null {
  const perOffer: SeriesPoint[][] = [];
  for (const row of rows) {
    const observations = index.get(row.offerId);
    if (!observations || observations.length === 0) continue;
    perOffer.push(offerSeries(row, observations, includeShipping));
  }
  if (perOffer.length === 0) return null;

  const timestamps = [...new Set(perOffer.flatMap((s) => s.map((p) => p.at)))].sort(
    (a, b) => a - b,
  );

  // Two REAL observations minimum. One observation plus "now" would draw a flat
  // line across the full width, which reads as "this price has held for 90
  // days" when what actually happened is that we first saw the listing twenty
  // minutes ago. An honest blank beats a confident straight line.
  if (timestamps.length < 2) return null;

  // Carry the last known price forward to the present so the line reaches the
  // right edge instead of stopping at whenever the price last moved.
  if (now > (timestamps.at(-1) ?? 0)) timestamps.push(now);

  const series: SeriesPoint[] = [];
  for (const at of timestamps) {
    let best: number | null = null;
    for (const offer of perOffer) {
      // The last observation at or before `at`; undefined before this offer
      // was first seen, which is not the same as expensive.
      let value: number | null = null;
      for (const point of offer) {
        if (point.at > at) break;
        value = point.pptCents;
      }
      if (value !== null && (best === null || value < best)) best = value;
    }
    if (best !== null) series.push({ at, pptCents: best });
  }

  if (series.length < 2) return null;

  const first = series[0];
  const last = series.at(-1);
  if (!first || !last) return null;

  let low = first;
  let high = first;
  for (const point of series) {
    if (point.pptCents < low.pptCents) low = point;
    if (point.pptCents > high.pptCents) high = point;
  }

  const depthDays = Math.floor((now - first.at) / DAY_MS);

  // Three conditions, all of them necessary:
  //   deep enough to be a claim rather than a coincidence,
  //   currently at the bottom of the window,
  //   and the window actually has a top — a price that never moved is not a
  //   deal, however low it is.
  const atTheBottom = last.pptCents <= low.pptCents + EPSILON;
  const windowHasRange = high.pptCents > last.pptCents + EPSILON;
  const cheapestInDays =
    depthDays >= MIN_BADGE_DAYS && atTheBottom && windowHasRange ? depthDays : null;

  return {
    series,
    depthDays,
    lowPptCents: low.pptCents,
    highPptCents: high.pptCents,
    highAt: high.at,
    cheapestInDays,
  };
}

/**
 * A sparkline as an SVG path, on a LINEAR y axis.
 *
 * Linear here, unlike the dispersion strip's log axis, because a sparkline
 * shows one drive's own range over time rather than the whole market's spread.
 * The y axis is padded to the series min/max, so the drawing answers "which way
 * has this moved and by how much relative to itself" — the only question a
 * 60-pixel graphic can honestly answer. It is deliberately unlabelled; the
 * numbers next to it are the readable form.
 */
export function sparklinePath(
  series: readonly SeriesPoint[],
  width: number,
  height: number,
  padding = 1,
): string {
  if (series.length < 2) return '';

  const times = series.map((p) => p.at);
  const values = series.map((p) => p.pptCents);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);

  const tSpan = tMax - tMin;
  const vSpan = vMax - vMin;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  return series
    .map((point, i) => {
      const x =
        padding +
        (tSpan === 0
          ? (i / (series.length - 1)) * usableW
          : ((point.at - tMin) / tSpan) * usableW);
      // A flat series draws down the middle rather than dividing by zero.
      const y =
        padding +
        (vSpan === 0
          ? usableH / 2
          : usableH - ((point.pptCents - vMin) / vSpan) * usableH);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Whole days between two epoch milliseconds, floored at zero. */
export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}
