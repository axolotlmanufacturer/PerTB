import { buildGroupHistory, type GroupHistory, type HistoryIndex } from './history';
import { pricePerTbCents } from './pricing';
import type { Query } from './query';
import {
  AXES,
  type Axis,
  type Condition,
  type FormFactor,
  type Interface,
  type Marketplace,
  type Technology,
} from './taxonomy';

/**
 * The read model and the facet-counting invariant.
 *
 * Everything here runs IN MEMORY after one query. At this scale — single-digit
 * thousands of live rows — pushing five independent GROUP BYs into SQL costs
 * more than one scan, and it would put a second implementation of the $/TB
 * rules into SQL where they could drift from pricing.ts.
 *
 * See CLAUDE.md §3.5.
 */

/** One live offer, flattened with the product fields the table needs. */
export interface DriveRow {
  offerId: string;
  productId: string;

  brand: string;
  model: string;
  capacityBytes: bigint;
  technology: Technology | null;
  formFactor: FormFactor | null;
  interface: Interface | null;
  rpm: number | null;
  shuckable: boolean;
  shuckedEquivalent: string | null;

  marketplace: Marketplace;
  /** ASIN or eBay item id — the Amazon link builder needs the ASIN. */
  externalId: string;
  condition: Condition;
  lotSize: number;
  priceCents: number;
  shippingCents: number;
  shippingIsCalculated: boolean;
  inStock: boolean;

  sellerName: string | null;
  sellerScore: number | null;

  // Used-drive risk surfacing — CLAUDE.md §3.7.
  powerOnHours: number | null;
  hasWarranty: boolean | null;
  returnPolicy: string | null;

  url: string;
}

const TB = 1_000_000_000_000;

/**
 * Does this row survive the query, ignoring one axis?
 *
 * `skipAxis` is the whole point. Counting an axis's own options while its own
 * selection is applied returns zero for every option the user did not pick,
 * and the checkbox group silently degrades into a radio group — the single
 * most common bug in faceted search.
 *
 * The boolean adjustments and the capacity range ALWAYS apply, on every count.
 */
export function passes(row: DriveRow, query: Query, skipAxis: Axis | null): boolean {
  if (query.inStockOnly && !row.inStock) return false;
  if (query.hideLots && row.lotSize > 1) return false;
  if (query.shuckable !== null && row.shuckable !== query.shuckable) return false;

  const capacityTb = Number(row.capacityBytes) / TB;
  if (query.capMin !== null && capacityTb < query.capMin) return false;
  if (query.capMax !== null && capacityTb > query.capMax) return false;

  for (const axis of AXES) {
    if (axis === skipAxis) continue;
    const selected = query[axis] as readonly string[];
    if (selected.length === 0) continue;
    const value = row[axis];
    // A row with no value on this axis can never satisfy a filter on it.
    if (value === null || !selected.includes(value)) return false;
  }

  return true;
}

/** $/TB for a row under the current shipping toggle. */
export function rowPricePerTbCents(row: DriveRow, query: Query): number {
  return pricePerTbCents(
    {
      capacityBytes: row.capacityBytes,
      lotSize: row.lotSize,
      priceCents: row.priceCents,
      shippingCents: row.shippingCents,
    },
    query.includeShipping,
  );
}

export type FacetCounts = { [K in Axis]: Record<string, number> };

function tally(rows: DriveRow[], axis: Axis): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = row[axis];
    if (value === null) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/**
 * One row of the table: the cheapest offer for a (product, condition), plus
 * every other offer for it.
 *
 * Collapsing is per (productId, condition) and NEVER across conditions — new
 * and used of the same drive are different products to a buyer, and merging
 * them would show a used price under a new-condition row.
 */
export interface OfferGroup {
  key: string;
  cheapest: DriveRow;
  cheapestPptCents: number;
  /** Every offer in the group, cheapest first. Length 1 is the common case. */
  offers: { row: DriveRow; pptCents: number }[];
  /** The 90-day series, when there is one. Null when history was not loaded. */
  history: GroupHistory | null;
  /** Populated only for shuckable externals — see `shuckComparison`. */
  shuck: ShuckComparison | null;
}

/**
 * A shuckable external measured against a bare drive (ticket 5.4).
 *
 * The comparator is the cheapest live BARE 3.5-inch drive of the same capacity
 * and condition — not "the drive inside this enclosure". The curated dictionary
 * is explicit that the part inside varies by production run, so naming it would
 * be exactly the guess §1.1 forbids. What can be stated without guessing is
 * what the buyer actually chooses between: this enclosure, or a bare drive of
 * the same size, today.
 */
export interface ShuckComparison {
  /** The cheapest bare equivalent's $/TB under the current shipping toggle. */
  barePptCents: number;
  /** e.g. "Seagate Exos X20". */
  bareLabel: string;
  /** Positive when shucking is the cheaper route, negative when it is not. */
  savingPptCents: number;
}

export interface DispersionTick {
  pptCents: number;
  /** Whether this listing is in the current filtered selection. */
  matched: boolean;
}

export interface TableView {
  groups: OfferGroup[];
  /** Offers that passed every filter. */
  matchedOffers: number;
  /** Live offers before filtering, for the dispersion strip and the counts. */
  totalOffers: number;
  facetCounts: FacetCounts;
  /** The cheapest $/TB in the current selection — the number the site is for. */
  floorPptCents: number | null;
  dispersion: DispersionTick[];
}

const SORTERS: Record<Query['sort'], (a: OfferGroup, b: OfferGroup) => number> = {
  ppt_asc: (a, b) => a.cheapestPptCents - b.cheapestPptCents,
  ppt_desc: (a, b) => b.cheapestPptCents - a.cheapestPptCents,
  price_asc: (a, b) => a.cheapest.priceCents - b.cheapest.priceCents,
  capacity_desc: (a, b) =>
    Number(b.cheapest.capacityBytes * BigInt(b.cheapest.lotSize)) -
    Number(a.cheapest.capacityBytes * BigInt(a.cheapest.lotSize)),
};

export interface BuildOptions {
  /** 90-day observations by offer id. Omit and groups carry no history. */
  history?: HistoryIndex;
  /** Injected so a render is deterministic and a test can pin the window. */
  now?: number;
}

export function buildTable(
  rows: DriveRow[],
  query: Query,
  options: BuildOptions = {},
): TableView {
  const { history, now = Date.now() } = options;
  const matched = rows.filter((row) => passes(row, query, null));

  // Each axis is counted against every OTHER filter, but not its own.
  const facetCounts = {} as FacetCounts;
  for (const axis of AXES) {
    facetCounts[axis] = tally(
      rows.filter((row) => passes(row, query, axis)),
      axis,
    );
  }

  const matchedIds = new Set(matched.map((r) => r.offerId));
  const dispersion: DispersionTick[] = rows.map((row) => ({
    pptCents: rowPricePerTbCents(row, query),
    matched: matchedIds.has(row.offerId),
  }));

  // Collapse to one row per (product, condition).
  const byKey = new Map<string, { row: DriveRow; pptCents: number }[]>();
  for (const row of matched) {
    const key = `${row.productId}|${row.condition}`;
    const entry = { row, pptCents: rowPricePerTbCents(row, query) };
    const existing = byKey.get(key);
    if (existing) existing.push(entry);
    else byKey.set(key, [entry]);
  }

  // Built from the UNFILTERED live set on purpose: /hdd/shuckable filters bare
  // drives out of the table, and a comparison drawn from what survived that
  // filter would silently become "cheapest other enclosure".
  const bare = bareIndex(rows, query);

  const groups: OfferGroup[] = [];
  for (const [key, offers] of byKey) {
    offers.sort((a, b) => a.pptCents - b.pptCents);
    const best = offers[0];
    if (!best) continue;
    groups.push({
      key,
      cheapest: best.row,
      cheapestPptCents: best.pptCents,
      offers,
      history: history
        ? buildGroupHistory(
            offers.map((o) => o.row),
            history,
            query.includeShipping,
            now,
          )
        : null,
      shuck: shuckComparison(best.row, best.pptCents, bare),
    });
  }

  groups.sort(SORTERS[query.sort]);

  const floorPptCents = groups.reduce<number | null>(
    (min, g) => (min === null || g.cheapestPptCents < min ? g.cheapestPptCents : min),
    null,
  );

  return {
    groups,
    matchedOffers: matched.length,
    totalOffers: rows.length,
    facetCounts,
    floorPptCents,
    dispersion,
  };
}

/** The bare drives a shuckable external can honestly be measured against. */
interface BareCandidate {
  pptCents: number;
  label: string;
}

function bareKey(capacityBytes: bigint, condition: Condition): string {
  return `${capacityBytes}|${condition}`;
}

/**
 * Cheapest bare 3.5-inch drive per (capacity, condition).
 *
 * Deliberately narrow. A lot of five is excluded because it is not the purchase
 * the shucker is weighing up, and an out-of-stock listing is excluded because a
 * saving against something nobody can buy is not a saving.
 */
function bareIndex(rows: DriveRow[], query: Query): Map<string, BareCandidate> {
  const index = new Map<string, BareCandidate>();

  for (const row of rows) {
    if (row.shuckable) continue;
    if (row.lotSize !== 1) continue;
    if (!row.inStock) continue;
    if (row.formFactor !== '3.5') continue;
    if (row.technology !== 'hdd_cmr' && row.technology !== 'hdd_smr') continue;

    const key = bareKey(row.capacityBytes, row.condition);
    const pptCents = rowPricePerTbCents(row, query);
    const existing = index.get(key);
    if (!existing || pptCents < existing.pptCents) {
      index.set(key, { pptCents, label: `${row.brand} ${row.model}` });
    }
  }

  return index;
}

/**
 * The shucking delta — CLAUDE.md §3.8, ticket 5.4.
 *
 * Returns null rather than a fallback whenever there is no like-for-like bare
 * drive live at that capacity. "No comparison available" is a true statement;
 * a comparison against a different capacity is not.
 */
function shuckComparison(
  row: DriveRow,
  pptCents: number,
  bare: Map<string, BareCandidate>,
): ShuckComparison | null {
  if (!row.shuckable) return null;

  const candidate = bare.get(bareKey(row.capacityBytes, row.condition));
  if (!candidate) return null;

  return {
    barePptCents: candidate.pptCents,
    bareLabel: candidate.label,
    savingPptCents: candidate.pptCents - pptCents,
  };
}

/**
 * Positions for the dispersion strip, on a LOG scale.
 *
 * Linear puts every hard drive in the leftmost 5% of the axis and spends the
 * rest of the width separating three overpriced Gen 5 SSDs. Log is the only
 * scale on which this distribution is readable.
 */
export function dispersionPositions(
  ticks: DispersionTick[],
): { x: number; matched: boolean }[] {
  const values = ticks.map((t) => t.pptCents).filter((v) => v > 0);
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const span = logMax - logMin;

  return ticks.map((t) => ({
    // A single distinct price collapses the span to zero; pin it mid-axis
    // rather than dividing by zero.
    x: span === 0 ? 0.5 : (Math.log10(Math.max(t.pptCents, min)) - logMin) / span,
    matched: t.matched,
  }));
}
