/**
 * Affiliate link builders.
 *
 * ============================================================================
 * DO NOT MODIFY WITHOUT ASKING. DO NOT AUTOFIX. DO NOT REFORMAT.
 * ============================================================================
 *
 * The URL parameters below are contractual with the eBay Partner Network and
 * Amazon Associates. Parameter order and presence are part of the agreement.
 *
 * The failure mode is silent and expensive: a "cleanup" that drops `mkevt` or
 * `toolid` leaves links that still resolve to the right product page, still
 * look correct in the table, still pass every test that checks the destination
 * — and earn nothing. Nobody notices until a payout is missing.
 *
 * This file is excluded from Prettier (.prettierignore), every fixable ESLint
 * rule is disabled for it (eslint.config.mjs), and
 * test/unit/affiliate-immutability.test.ts asserts the fixer and the formatter
 * leave it byte-identical. See CLAUDE.md §1.6 and known trap 12.
 */

/**
 * The per-route sub-id. Set to the landing-page slug so revenue attributes to
 * routes rather than arriving as one undifferentiated pile (ticket 4.6).
 *
 * Both networks reject exotic characters in their tracking fields, so this is
 * conservative on purpose: lowercase alphanumerics, dash and underscore.
 */
export function normaliseSubId(subId: string | null | undefined): string {
  if (!subId) return 'home';
  const cleaned = subId
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'home';
}

export interface EbayLinkParams {
  /** `itemWebUrl` exactly as the Browse API returned it. */
  itemWebUrl: string;
  /** 10-digit ePN campaign id. */
  campaignId: string;
  /** ePN rotation id, e.g. 711-53200-19255-0. */
  rotationId: string;
  /** Landing-page slug. */
  subId?: string | null;
}

/**
 * eBay Partner Network tracking link.
 *
 *   {itemWebUrl}&mkevt=1&mkcid=1&mkrid={rotation}&campid={campaign}&toolid=10001&customid={subId}
 *
 * The Feed API does not return tracking links, so we build them.
 *
 * The one thing that adapts is the separator: eBay item URLs usually have no
 * query string, and appending "&mkevt=1" to a URL without a "?" produces a
 * link that tracks nothing. Parameter order and presence are unchanged.
 */
export function buildEbayLink(params: EbayLinkParams): string {
  const separator = params.itemWebUrl.includes('?') ? '&' : '?';

  return (
    params.itemWebUrl +
    separator +
    'mkevt=1' +
    '&mkcid=1' +
    '&mkrid=' +
    encodeURIComponent(params.rotationId) +
    '&campid=' +
    encodeURIComponent(params.campaignId) +
    '&toolid=10001' +
    '&customid=' +
    encodeURIComponent(normaliseSubId(params.subId))
  );
}

export interface AmazonLinkParams {
  asin: string;
  /** Associates tracking id, e.g. yourtag-20. */
  partnerTag: string;
  /** Marketplace host, e.g. www.amazon.com. */
  marketplace?: string;
  /** Landing-page slug. */
  subId?: string | null;
}

/**
 * Amazon Associates product link.
 *
 *   https://{marketplace}/dp/{ASIN}?tag={partnerTag}&linkCode=ogi&th=1&ascsubtag={subId}
 *
 * `ascsubtag` is the Associates sub-tag field; it is what makes per-route
 * attribution work in the Associates reports.
 */
export function buildAmazonLink(params: AmazonLinkParams): string {
  const host = params.marketplace ?? 'www.amazon.com';

  return (
    'https://' +
    host +
    '/dp/' +
    encodeURIComponent(params.asin) +
    '?tag=' +
    encodeURIComponent(params.partnerTag) +
    '&linkCode=ogi' +
    '&th=1' +
    '&ascsubtag=' +
    encodeURIComponent(normaliseSubId(params.subId))
  );
}

/**
 * Applied to every outbound affiliate link. `sponsored` and `nofollow` are
 * required disclosure to search engines; `noopener` is basic hygiene on a
 * target=_blank link. Asserted against rendered markup at ticket 7.5.
 */
export const AFFILIATE_REL = 'nofollow sponsored noopener';
