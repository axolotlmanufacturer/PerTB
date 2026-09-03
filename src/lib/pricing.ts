/**
 * The one definition of $/TB. There is no second implementation anywhere —
 * not in a component, not in a SQL expression, not in the ingest job.
 *
 * CLAUDE.md §3.2:
 *
 *   totalBytes     = capacityBytesOfOneDrive × lotSize
 *   effectiveCents = priceCents + (includeShipping ? shippingCents : 0)
 *   pricePerTB     = effectiveCents ÷ (totalBytes ÷ 1_000_000_000_000)
 *
 * Never stored, always derived at read time, because the shipping and lot
 * rules are user-toggleable.
 */

/**
 * DECIMAL terabytes. 10^12, not 2^40.
 *
 * A drive sold as "20TB" contains 20 × 10^12 bytes and presents as ~18.2 TiB
 * once formatted. We price against the advertised figure because that is the
 * figure the buyer is comparing across listings. Switching to TiB would make
 * every number on this site ~10% higher than every competitor's and read as a
 * bug. See known trap 1 — this constant is the whole of it.
 */
export const BYTES_PER_TB = 1_000_000_000_000n;

/** Same value as a number, for the division. */
const BYTES_PER_TB_NUM = 1_000_000_000_000;

export interface PricingInput {
  /** Capacity of ONE drive. Not the lot total. */
  capacityBytes: bigint;
  /** Number of physical drives in the listing. 1 for a single drive. */
  lotSize: number;
  priceCents: number;
  /**
   * Shipping in cents. eBay `CALCULATED` shipping arrives here as 0 with a
   * flag on the offer — we do not invent a figure (known trap 6). Amazon
   * feed prices are delivered-price for Prime items, so adding an estimate
   * on top would double-count (known trap 7).
   */
  shippingCents: number;
}

/** Total bytes across every drive in the listing. */
export function totalBytes(capacityBytes: bigint, lotSize: number): bigint {
  assertValidLotSize(lotSize);
  if (capacityBytes <= 0n) {
    throw new RangeError(`capacityBytes must be positive, got ${capacityBytes}`);
  }
  return capacityBytes * BigInt(lotSize);
}

/** Total decimal terabytes across every drive in the listing. */
export function totalTerabytes(capacityBytes: bigint, lotSize: number): number {
  return Number(totalBytes(capacityBytes, lotSize)) / BYTES_PER_TB_NUM;
}

/**
 * The price the buyer actually pays, in cents.
 *
 * Shipping is included by default. Without it, eBay's $0.99 item + $28
 * shipping listings beat everything on Amazon permanently and sit at the top
 * of the table forever.
 */
export function effectiveCents(input: PricingInput, includeShipping = true): number {
  assertNonNegativeMoney(input.priceCents, 'priceCents');
  assertNonNegativeMoney(input.shippingCents, 'shippingCents');
  return input.priceCents + (includeShipping ? input.shippingCents : 0);
}

/**
 * Price per decimal terabyte, in cents.
 *
 * Cents rather than dollars so the caller decides on rounding; the audience
 * is price-sensitive to the cent and a premature round here would show up as
 * a wrong number downstream.
 */
export function pricePerTbCents(input: PricingInput, includeShipping = true): number {
  const terabytes = totalTerabytes(input.capacityBytes, input.lotSize);
  if (terabytes <= 0) {
    throw new RangeError('total capacity must be positive');
  }
  return effectiveCents(input, includeShipping) / terabytes;
}

/** Price per decimal terabyte, in dollars. */
export function pricePerTbDollars(input: PricingInput, includeShipping = true): number {
  return pricePerTbCents(input, includeShipping) / 100;
}

/**
 * Display form, e.g. `$12.34`. Two decimals: this audience compares to the
 * cent and a whole-dollar figure hides real differences between listings.
 */
export function formatPricePerTb(input: PricingInput, includeShipping = true): string {
  return formatDollars(pricePerTbDollars(input, includeShipping));
}

export function formatDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

/**
 * Capacity as the marketing figure the listing advertises, e.g. `20 TB`.
 * Decimal, for the same reason the pricing is.
 */
export function formatCapacity(capacityBytes: bigint): string {
  const tb = Number(capacityBytes) / BYTES_PER_TB_NUM;
  if (tb >= 1) {
    // 7.68 TB enterprise parts are real; do not round them to 8.
    const rounded = Math.round(tb * 100) / 100;
    return `${rounded} TB`;
  }
  const gb = Number(capacityBytes) / 1_000_000_000;
  return `${Math.round(gb)} GB`;
}

function assertValidLotSize(lotSize: number): void {
  if (!Number.isInteger(lotSize) || lotSize < 1) {
    throw new RangeError(`lotSize must be a positive integer, got ${lotSize}`);
  }
}

function assertNonNegativeMoney(cents: number, field: string): void {
  if (!Number.isFinite(cents) || cents < 0) {
    throw new RangeError(`${field} must be a non-negative number, got ${cents}`);
  }
}
