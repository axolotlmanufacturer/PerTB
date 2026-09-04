import type { Condition, Marketplace } from '../taxonomy';

/**
 * The source adapter contract.
 *
 * Every marketplace implements this and nothing else knows the difference.
 * The interface stays open for Newegg and B&H later; those are explicitly NOT
 * implemented in v1 (CLAUDE.md §2).
 *
 * NOTHING in here or in any implementation fetches retailer HTML. Official
 * APIs only — see CLAUDE.md §1.2. An adapter that cannot get a field from its
 * API leaves it undefined and the site does without it.
 */

/**
 * One listing as the marketplace reported it, before normalisation.
 *
 * Deliberately close to the wire: adapters translate shapes and units, they do
 * not interpret. Working out what drive this actually is happens exactly once,
 * in normalize.ts, so every marketplace gets the same correctness rules.
 */
export interface RawListing {
  marketplace: Marketplace;

  /** ASIN, or the eBay legacy item id. Unique within the marketplace. */
  externalId: string;

  /** The seller-written title. Everything rests on parsing this. */
  title: string;

  /** Item specifics or description text, where the API returns it. */
  description?: string;

  condition: Condition;

  priceCents: number;

  /**
   * Shipping in cents. Zero when the marketplace says free, and ALSO zero when
   * eBay reports CALCULATED — in which case shippingIsCalculated is true and
   * the row is flagged rather than given an invented figure (known trap 6).
   */
  shippingCents: number;
  shippingIsCalculated: boolean;

  currency: string;
  locale: string;
  inStock: boolean;

  sellerName?: string;
  /** Feedback percentage, 0-100. */
  sellerScore?: number;

  /** The plain product URL. Affiliate parameters are added in affiliate.ts. */
  url: string;
}

export interface SourceAdapter {
  readonly marketplace: Marketplace;

  /**
   * False when the marketplace is switched off by env, or its credentials are
   * missing. A disabled adapter is skipped silently — the site is designed to
   * run on eBay alone, indefinitely.
   */
  readonly enabled: boolean;

  /**
   * How long a listing from this source may be displayed.
   *
   * eBay: 6 hours — inventory is single-unit and vanishes the moment it sells.
   * Amazon: 24 hours, a HARD ceiling set by the Associates Operating
   * Agreement, not a tuning knob (CLAUDE.md §1.3).
   */
  readonly ttlHours: number;

  /** One keyword sweep. Implementations sleep between calls; both APIs throttle. */
  search(keyword: string): Promise<RawListing[]>;
}

/**
 * Amazon's Creators API revoking access is an expected operating state, not a
 * failure. Ingest catches this specific type, logs a warning, breaks out of the
 * Amazon loop and carries on with eBay. It must never fail a run, fail a build,
 * or empty a page.
 */
export class AmazonNotEligibleError extends Error {
  override readonly name = 'AmazonNotEligibleError';

  constructor(message = 'Amazon Creators API returned 403 AssociateNotEligible') {
    super(message);
  }
}

/** The keyword sweep. Broad enough to cover the catalogue, small enough to fit the cron. */
export const SEARCH_KEYWORDS: readonly string[] = [
  'internal hard drive 3.5',
  'nas hard drive cmr',
  'enterprise hard drive sas',
  'sata ssd 2.5',
  'nvme m.2 ssd',
  'm.2 2230 ssd',
  'u.2 enterprise ssd',
  'external hard drive desktop',
  'portable ssd usb',
  'refurbished enterprise hard drive',
] as const;

/** Both APIs throttle a tight loop and the errors are unhelpfully generic. */
export const RATE_LIMIT_DELAY_MS = 400;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
