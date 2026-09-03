import { buildAmazonLink, buildEbayLink, normaliseSubId } from './affiliate';
import type { DriveRow } from './table';

/**
 * Turns a stored listing URL into the tagged outbound link.
 *
 * This happens at RENDER time, not at ingest time, because the sub-id is the
 * landing-page slug: the same offer earns under a different sub-id depending
 * on which route the visitor came through (ticket 4.6). Baking a link into the
 * database would collapse every route into one undifferentiated bucket.
 *
 * affiliate.ts itself is untouched and untouchable — this only calls it.
 */

export interface AffiliateConfig {
  epnCampaignId?: string;
  epnRotationId?: string;
  amazonPartnerTag?: string;
  amazonMarketplace?: string;
}

export function readAffiliateConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AffiliateConfig {
  return {
    epnCampaignId: env.EPN_CAMPAIGN_ID,
    epnRotationId: env.EPN_ROTATION_ID,
    amazonPartnerTag: env.AMAZON_PARTNER_TAG,
    amazonMarketplace: env.AMAZON_MARKETPLACE,
  };
}

/**
 * Falls back to the plain product URL when the network's credentials are
 * absent — a local checkout with no ePN campaign id should still show working
 * links rather than links carrying an empty `campid`, which is worse than no
 * parameters at all: it looks tracked and is not.
 */
export function outboundUrl(
  row: Pick<DriveRow, 'marketplace' | 'externalId' | 'url'>,
  subId: string,
  config: AffiliateConfig = readAffiliateConfig(),
): string {
  if (row.marketplace === 'ebay') {
    if (!config.epnCampaignId || !config.epnRotationId) return row.url;
    return buildEbayLink({
      itemWebUrl: row.url,
      campaignId: config.epnCampaignId,
      rotationId: config.epnRotationId,
      subId,
    });
  }

  if (!config.amazonPartnerTag) return row.url;
  return buildAmazonLink({
    asin: row.externalId,
    partnerTag: config.amazonPartnerTag,
    ...(config.amazonMarketplace ? { marketplace: config.amazonMarketplace } : {}),
    subId,
  });
}

/** True when links on this deployment actually earn anything. */
export function isAffiliateConfigured(
  config: AffiliateConfig = readAffiliateConfig(),
): boolean {
  return Boolean(
    (config.epnCampaignId && config.epnRotationId) || config.amazonPartnerTag,
  );
}

export { normaliseSubId };
