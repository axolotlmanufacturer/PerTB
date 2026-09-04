import { historyKey, type HistoryIndex } from './history';
import { passes, type DriveRow } from './table';
import type { Query } from './query';

/**
 * When did the content of a view last actually change?
 *
 * This exists for one consumer — `lastModified` in the sitemap — and it exists
 * because the obvious answers are all wrong:
 *
 *   `new Date()`      tells Google every route changed on every fetch. An
 *                     always-current lastmod is not a freshness signal, it is
 *                     noise, and the documented consequence is that the
 *                     crawler stops believing lastmod for the whole site —
 *                     including the editorial pages where the date is real.
 *
 *   `Offer.fetchedAt` moves on every sweep for every listing still on sale,
 *                     because an unchanged offer still needs its expiry pushed
 *                     out. It records that we looked, not that anything moved.
 *
 *   `Offer.updatedAt` same problem, for the same reason.
 *
 * What is left are the two changes that leave a durable mark:
 *
 *   a listing appeared     `Offer.createdAt`, surfaced as `row.firstSeenAt`
 *   a price moved          `PricePoint.observedAt` — written only when the
 *                          price actually changed (CLAUDE.md §3.4)
 *
 * A listing DISAPPEARING also changes the view and leaves no mark at all: the
 * row is hard-deleted on expiry (§1.3) and we keep no tombstone. So what this
 * returns is a **lower bound** — "at least this recent" — and it is honest in
 * the safe direction. Under-reporting costs a little crawl freshness;
 * over-reporting costs the credibility of the signal.
 *
 * Per view, not per site. `/hdd/nas` does not become fresh because an NVMe
 * price moved, so each route is scored over the rows that route actually
 * shows, using the same `passes()` the table uses. One implementation of the
 * filter, as everywhere else.
 */

/** The newest observation recorded for a group, or null if there are none. */
function newestObservation(history: HistoryIndex, key: string): number | null {
  const observations = history.get(key);
  if (!observations || observations.length === 0) return null;

  // loadPriceHistory orders by observedAt ascending, but this must not depend
  // on that: a caller assembling an index by hand would silently get a wrong
  // date, and a wrong date is the thing this file exists to prevent.
  let newest: number | null = null;
  for (const observation of observations) {
    if (newest === null || observation.at > newest) newest = observation.at;
  }
  return newest;
}

/** The last time this row's content changed, as far as we can prove it. */
export function rowLastChangedAt(row: DriveRow, history: HistoryIndex): number {
  const firstSeen = row.firstSeenAt.getTime();
  const priced = newestObservation(history, historyKey(row.productId, row.condition));
  return priced !== null && priced > firstSeen ? priced : firstSeen;
}

/**
 * The last time anything in this view changed.
 *
 * `query` null means the unfiltered table — every live row. Returns null when
 * the view is empty, and the caller should then omit `lastModified` rather
 * than substitute a date: a route with nothing in it has no modification time,
 * and inventing one is exactly the failure this module is about.
 */
export function viewLastModified(
  rows: readonly DriveRow[],
  history: HistoryIndex,
  query: Query | null,
): Date | null {
  let newest: number | null = null;

  for (const row of rows) {
    // skipAxis is null: a sitemap entry is not a facet count, so every axis of
    // the landing's own filter applies.
    if (query !== null && !passes(row, query, null)) continue;

    const changed = rowLastChangedAt(row, history);
    if (newest === null || changed > newest) newest = changed;
  }

  return newest === null ? null : new Date(newest);
}

/** The newest of a set of dates, for the editorial routes. Null if empty. */
export function newestDate(dates: readonly (Date | string)[]): Date | null {
  let newest: number | null = null;
  for (const date of dates) {
    const at = new Date(date).getTime();
    if (Number.isNaN(at)) continue;
    if (newest === null || at > newest) newest = at;
  }
  return newest === null ? null : new Date(newest);
}
