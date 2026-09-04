import type { Condition } from '../taxonomy';
import {
  AmazonNotEligibleError,
  RATE_LIMIT_DELAY_MS,
  sleep,
  type RawListing,
  type SourceAdapter,
} from './types';

/**
 * Amazon Creators API.
 *
 * PA-API 5.0 IS RETIRED and no longer accepts new registrations. Do not follow
 * any PA-API tutorial: the SigV4 request-signing approach is dead. This is the
 * Creators API, which is OAuth2 client-credentials.
 *
 * Treat this source as one that can vanish at any moment. Eligibility requires
 * >=10 qualifying sales in the trailing 30 days and is revoked after any 30-day
 * stretch without them, so `403 AssociateNotEligible` is an ordinary operating
 * state — see AmazonNotEligibleError and CLAUDE.md §1.4.
 *
 * Official API only. Nothing here fetches amazon.com HTML, and nothing may be
 * added that does.
 */

const OAUTH_URL = 'https://api.amazon.com/auth/o2/token';

/**
 * The Creators API is a new ENDPOINT for the PA-API operations, not a
 * differently-shaped API. One host serves every marketplace; the marketplace
 * is routed by the `x-marketplace` header rather than a body field.
 */
const SEARCH_URL = 'https://creatorsapi.amazon/catalog/v1/searchItems';

/**
 * Request and response fields are lowerCamelCase, where PA-API 5.0 used
 * PascalCase: `ItemInfo.Title.DisplayValue` became `itemInfo.title.displayValue`.
 */
const SEARCH_RESOURCES = [
  'itemInfo.title',
  'itemInfo.features',
  'offersV2.listings.price',
  'offersV2.listings.condition',
  'offersV2.listings.availability',
  'offersV2.listings.isBuyBoxWinner',
] as const;

/**
 * 24 hours is a HARD CEILING from the Associates Operating Agreement, which
 * requires displayed prices be refreshed or removed within that window. It is
 * not a tuning knob. See CLAUDE.md §1.3.
 */
const TTL_HOURS = 24;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/** Test seam. */
export function resetAmazonToken(): void {
  tokenCache = null;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}

/**
 * A 403 carrying AssociateNotEligible means the account has fallen below the
 * sales threshold. It is thrown as a distinct type so ingest can tell it apart
 * from a credential mistake or an outage, all of which need different handling.
 */
function assertEligible(status: number, body: string): void {
  if (status === 403 && /AssociateNotEligible/i.test(body)) {
    throw new AmazonNotEligibleError(
      'Amazon Creators API access revoked: fewer than 10 qualifying sales in the trailing 30 days',
    );
  }
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  scope?: string,
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      // Overridable: Amazon does not publish the scope string outside
      // Associates Central, and it differs by credential version.
      ...(scope ? { scope } : {}),
    }),
  });

  if (!res.ok) {
    const body = await safeText(res);
    assertEligible(res.status, body);
    throw new Error(`Amazon OAuth failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Amazon OAuth returned no access_token');

  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

function mapCondition(raw: string | undefined): Condition {
  const v = (raw ?? '').toLowerCase();
  if (v.includes('renewed') || v.includes('refurbish')) return 'renewed';
  if (v.includes('used')) return 'used';
  return 'new';
}

interface AmazonItem {
  asin?: string;
  detailPageURL?: string;
  itemInfo?: {
    // Known trap 9: this can be absent entirely. Guard everything.
    title?: { displayValue?: string };
    features?: { displayValues?: string[] };
  };
  /** `Offers` is DEPRECATED. This is OffersV2. */
  offersV2?: {
    listings?: {
      condition?: { value?: string };
      price?: {
        money?: { amount?: number; currencyCode?: string };
      };
      availability?: { type?: string };
      isBuyBoxWinner?: boolean;
    }[];
  };
}

interface AmazonSearchResponse {
  searchResult?: { items?: AmazonItem[] };
  /** Defensive fallback if the envelope ever flattens. */
  items?: AmazonItem[];
}

export interface AmazonConfig {
  credentialId: string;
  credentialSecret: string;
  partnerTag: string;
  marketplace: string;
  /** Sent in the Authorization header as `Bearer <token>, Version <this>`. */
  credentialVersion: string;
  /** Optional OAuth scope; omitted from the token request when unset. */
  scope?: string;
}

export function readAmazonConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AmazonConfig | null {
  const credentialId = env.AMAZON_CREDENTIAL_ID;
  const credentialSecret = env.AMAZON_CREDENTIAL_SECRET;
  const partnerTag = env.AMAZON_PARTNER_TAG;
  if (!credentialId || !credentialSecret || !partnerTag) return null;

  return {
    credentialId,
    credentialSecret,
    partnerTag,
    marketplace: env.AMAZON_MARKETPLACE ?? 'www.amazon.com',
    credentialVersion: env.AMAZON_CREDENTIAL_VERSION ?? '3.0',
    ...(env.AMAZON_OAUTH_SCOPE ? { scope: env.AMAZON_OAUTH_SCOPE } : {}),
  };
}

export function mapItem(item: AmazonItem, marketplace: string): RawListing | null {
  const asin = item.asin;
  // ItemInfo.Title can be absent on Creators API responses (known trap 9).
  const title = item.itemInfo?.title?.displayValue;
  if (!asin || !title) return null;

  const listing =
    item.offersV2?.listings?.find((l) => l.isBuyBoxWinner) ??
    item.offersV2?.listings?.[0];
  const amount = listing?.price?.money?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;

  return {
    marketplace: 'amazon',
    externalId: asin,
    title,
    description: (item.itemInfo?.features?.displayValues ?? []).join(' '),
    condition: mapCondition(listing?.condition?.value),
    priceCents: Math.round(amount * 100),
    // Known trap 7: Amazon feed prices are DELIVERED price for Prime items.
    // Adding a shipping estimate on top would double-count.
    shippingCents: 0,
    shippingIsCalculated: false,
    currency: listing?.price?.money?.currencyCode ?? 'USD',
    locale: 'en-US',
    inStock: (listing?.availability?.type ?? 'IN_STOCK') === 'IN_STOCK',
    url: item.detailPageURL ?? `https://${marketplace}/dp/${asin}`,
  };
}

export function createAmazonAdapter(
  config: AmazonConfig,
  options: { enabled?: boolean } = {},
): SourceAdapter {
  return {
    marketplace: 'amazon',
    enabled: options.enabled ?? true,
    ttlHours: TTL_HOURS,

    async search(keyword: string): Promise<RawListing[]> {
      const token = await getAccessToken(
        config.credentialId,
        config.credentialSecret,
        config.scope,
      );

      const res = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: {
          // The credential version is part of the header value, not a
          // separate field.
          Authorization: `Bearer ${token}, Version ${config.credentialVersion}`,
          'x-marketplace': config.marketplace,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keywords: keyword,
          partnerTag: config.partnerTag,
          partnerType: 'Associates',
          // Without `resources` the response carries neither titles nor
          // offers, and every item would be dropped by the mapper.
          resources: SEARCH_RESOURCES,
          itemCount: 10,
        }),
      });

      await sleep(RATE_LIMIT_DELAY_MS);

      if (!res.ok) {
        const body = await safeText(res);
        assertEligible(res.status, body);
        throw new Error(`Amazon search failed: ${res.status} ${body}`);
      }

      const json = (await res.json()) as AmazonSearchResponse;
      // `searchResult.items` is the documented shape; the bare `items`
      // fallback costs nothing and avoids a silent empty sweep if it moves.
      const items = json.searchResult?.items ?? json.items ?? [];

      return items
        .map((item) => mapItem(item, config.marketplace))
        .filter((l): l is RawListing => l !== null);
    },
  };
}

export { AmazonNotEligibleError };
