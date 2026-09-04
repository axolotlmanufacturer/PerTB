import type { Condition } from '../taxonomy';
import { RATE_LIMIT_DELAY_MS, sleep, type RawListing, type SourceAdapter } from './types';

/**
 * eBay Browse API + eBay Partner Network.
 *
 * The primary source, and the differentiator: used enterprise drives live here,
 * and that is where the genuinely lowest $/TB on the market sits.
 *
 * This talks to the official Browse API only. It does not fetch ebay.com HTML,
 * and must not be extended to (CLAUDE.md §1.2).
 */

const OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

/**
 * Internal HDD, internal SSD, external HDD. This is what keeps enclosures,
 * cables and caddies out of the table — normalisation is the backstop, not the
 * first line of defence.
 */
const CATEGORY_IDS = '175669,175670,131553';

/**
 * FIXED_PRICE excludes auctions: a moving price cannot be ranked between
 * refreshes, so an auction's price is stale the moment it is stored.
 */
const FILTER = 'buyingOptions:{FIXED_PRICE},itemLocationCountry:US,deliveryCountry:US';

/** eBay inventory is single-unit and vanishes the moment it sells. */
const TTL_HOURS = 6;

const PAGE_LIMIT = 200;

interface TokenCache {
  token: string;
  expiresAt: number;
}

/** Module scope, per the brief: tokens last ~2 hours. */
let tokenCache: TokenCache | null = null;

/** Test seam. */
export function resetEbayToken(): void {
  tokenCache = null;
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: OAUTH_SCOPE }),
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: ${res.status} ${await safeText(res)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('eBay OAuth returned no access_token');

  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 7200) * 1000,
  };
  return tokenCache.token;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}

/** eBay condition ids/labels mapped onto our three-value axis. */
function mapCondition(raw: string | undefined): Condition {
  const v = (raw ?? '').toUpperCase();
  if (v.includes('NEW')) return 'new';
  if (v.includes('REFURBISH') || v.includes('RENEWED') || v.includes('CERTIFIED')) {
    return 'renewed';
  }
  return 'used';
}

function toCents(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

interface EbayItemSummary {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  shortDescription?: string;
  condition?: string;
  conditionId?: string;
  itemWebUrl?: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: {
    shippingCostType?: string;
    shippingCost?: { value?: string; currency?: string };
  }[];
  seller?: {
    username?: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  estimatedAvailabilities?: { estimatedAvailabilityStatus?: string }[];
}

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  marketplaceId: string;
  campaignId: string;
  minFeedbackPct: number;
  minFeedbackCount: number;
}

export function readEbayConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EbayConfig | null {
  const clientId = env.EBAY_CLIENT_ID;
  const clientSecret = env.EBAY_CLIENT_SECRET;
  const campaignId = env.EPN_CAMPAIGN_ID;
  if (!clientId || !clientSecret || !campaignId) return null;

  return {
    clientId,
    clientSecret,
    marketplaceId: env.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
    campaignId,
    minFeedbackPct: Number(env.EBAY_MIN_FEEDBACK_PCT ?? 98.5),
    minFeedbackCount: Number(env.EBAY_MIN_FEEDBACK_COUNT ?? 50),
  };
}

/**
 * Used enterprise drives are where the lowest $/TB sits and also where the
 * worst sellers are. These two numbers are the whole filter.
 */
export function passesSellerFloor(
  seller: EbayItemSummary['seller'],
  config: Pick<EbayConfig, 'minFeedbackPct' | 'minFeedbackCount'>,
): boolean {
  const pct = Number(seller?.feedbackPercentage ?? NaN);
  const count = Number(seller?.feedbackScore ?? NaN);
  if (!Number.isFinite(pct) || !Number.isFinite(count)) return false;
  return pct >= config.minFeedbackPct && count >= config.minFeedbackCount;
}

/**
 * Known trap 6: CALCULATED shipping returns no cost, because the buyer's
 * postcode decides it. Return zero and flag it — never invent a figure, and
 * never quietly treat it as free postage.
 */
export function readShipping(item: EbayItemSummary): {
  shippingCents: number;
  shippingIsCalculated: boolean;
} {
  const option = item.shippingOptions?.[0];
  if (!option) return { shippingCents: 0, shippingIsCalculated: false };

  if ((option.shippingCostType ?? '').toUpperCase() === 'CALCULATED') {
    return { shippingCents: 0, shippingIsCalculated: true };
  }
  return {
    shippingCents: toCents(option.shippingCost?.value),
    shippingIsCalculated: false,
  };
}

export function mapItem(item: EbayItemSummary): RawListing | null {
  // Guard everything: the API omits fields freely.
  const externalId = item.legacyItemId ?? item.itemId;
  const title = item.title;
  const url = item.itemWebUrl;
  if (!externalId || !title || !url) return null;

  const priceCents = toCents(item.price?.value);
  if (priceCents <= 0) return null;

  const { shippingCents, shippingIsCalculated } = readShipping(item);
  const availability = item.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus;

  return {
    marketplace: 'ebay',
    externalId,
    title,
    description: item.shortDescription ?? '',
    condition: mapCondition(item.condition ?? item.conditionId),
    priceCents,
    shippingCents,
    shippingIsCalculated,
    currency: item.price?.currency ?? 'USD',
    locale: 'en-US',
    inStock: availability !== 'OUT_OF_STOCK',
    sellerName: item.seller?.username,
    sellerScore: Number(item.seller?.feedbackPercentage ?? NaN) || undefined,
    url,
  };
}

export function createEbayAdapter(
  config: EbayConfig,
  options: { enabled?: boolean } = {},
): SourceAdapter {
  return {
    marketplace: 'ebay',
    enabled: options.enabled ?? true,
    ttlHours: TTL_HOURS,

    async search(keyword: string): Promise<RawListing[]> {
      const token = await getAccessToken(config.clientId, config.clientSecret);

      const url = new URL(SEARCH_URL);
      url.searchParams.set('q', keyword);
      url.searchParams.set('category_ids', CATEGORY_IDS);
      url.searchParams.set('filter', FILTER);
      url.searchParams.set('limit', String(PAGE_LIMIT));

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': config.marketplaceId,
          // Affiliate attribution is a HEADER. Without it the traffic earns
          // nothing, no matter what the outbound link looks like.
          'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${config.campaignId},contextualLocation=country%3DUS`,
        },
      });

      // Both APIs throttle a tight loop and the errors are unhelpfully generic.
      await sleep(RATE_LIMIT_DELAY_MS);

      if (!res.ok) {
        throw new Error(`eBay search failed: ${res.status} ${await safeText(res)}`);
      }

      const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
      const items = json.itemSummaries ?? [];

      return items
        .filter((item) => passesSellerFloor(item.seller, config))
        .map(mapItem)
        .filter((l): l is RawListing => l !== null);
    },
  };
}
