import type { PrismaClient } from '@prisma/client';
import { isPublishable, normalise, type Normalised } from './normalize';
import { toPrismaFormFactor } from './prisma-enums';
import {
  AmazonNotEligibleError,
  SEARCH_KEYWORDS,
  type RawListing,
  type SourceAdapter,
} from './sources/types';

/**
 * The ingest sweep: fetch → normalise → upsert → expire.
 *
 * Written as a library function taking its adapters and client as arguments so
 * the resilience tests (ticket 2.7) can drive it directly. scripts/ingest.ts is
 * a thin wrapper that wires up the real ones.
 */

export interface IngestResult {
  offersUpserted: number;
  productsUpserted: number;
  pricePointsWritten: number;
  quarantined: number;
  rejected: number;
  expiredDeleted: number;
  /** Marketplaces that were skipped, and why. Never a failure. */
  skipped: { marketplace: string; reason: string }[];
}

export interface IngestOptions {
  prisma: PrismaClient;
  adapters: SourceAdapter[];
  keywords?: readonly string[];
  now?: Date;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/**
 * A product identity we can key on.
 *
 * `model` prefers the curated family name, because that is stable across the
 * dozens of ways sellers write the same drive. Without a dictionary hit we fall
 * back to a conservative slug of the title, which keeps distinct drives apart
 * without pretending we know more than we do.
 */
export function productIdentity(
  title: string,
  n: Normalised,
): { brand: string; model: string } {
  if (n.brand && n.family) return { brand: n.brand, model: n.family };

  const cleaned = title
    .replace(/\b\d+(\.\d+)?\s*(TB|GB)\b/gi, ' ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter((w) => w.length > 1);
  return {
    brand: n.brand ?? words[0] ?? 'Unknown',
    model: words.slice(0, 4).join(' ') || 'Unknown',
  };
}

function expiryFor(adapter: SourceAdapter, now: Date): Date {
  return new Date(now.getTime() + adapter.ttlHours * 60 * 60 * 1000);
}

export async function runIngest(options: IngestOptions): Promise<IngestResult> {
  const {
    prisma,
    adapters,
    keywords = SEARCH_KEYWORDS,
    now = new Date(),
    logger = console,
  } = options;

  const result: IngestResult = {
    offersUpserted: 0,
    productsUpserted: 0,
    pricePointsWritten: 0,
    quarantined: 0,
    rejected: 0,
    expiredDeleted: 0,
    skipped: [],
  };

  const seenProducts = new Set<string>();

  for (const adapter of adapters) {
    if (!adapter.enabled) {
      result.skipped.push({ marketplace: adapter.marketplace, reason: 'disabled' });
      logger.info(`[ingest] ${adapter.marketplace}: disabled, skipping`);
      continue;
    }

    const listings: RawListing[] = [];

    try {
      for (const keyword of keywords) {
        listings.push(...(await adapter.search(keyword)));
      }
    } catch (error) {
      if (error instanceof AmazonNotEligibleError) {
        // The expected operating state, not a failure. Break out of the Amazon
        // loop, log a warning, carry on with eBay. Never fail the run.
        result.skipped.push({
          marketplace: adapter.marketplace,
          reason: 'AssociateNotEligible',
        });
        logger.warn(
          `[ingest] ${adapter.marketplace}: ${error.message}. Continuing without it — the site is designed to run on eBay alone.`,
        );
        continue;
      }
      // Any other source failure is also survivable: one broken marketplace
      // must not empty the table for the other.
      result.skipped.push({
        marketplace: adapter.marketplace,
        reason: error instanceof Error ? error.message : String(error),
      });
      logger.error(`[ingest] ${adapter.marketplace} failed:`, error);
      continue;
    }

    const expiresAt = expiryFor(adapter, now);

    // Deduplicate within the sweep: keyword slices overlap.
    const unique = new Map<string, RawListing>();
    for (const listing of listings) unique.set(listing.externalId, listing);

    for (const listing of unique.values()) {
      const n = normalise(listing.title, listing.description ?? '');

      if (n.rejected || n.capacityBytes === null) {
        result.rejected++;
        continue;
      }

      // Below threshold: stored so /admin/quarantine can review it, but every
      // read path filters on confidence so it never reaches the table.
      if (!isPublishable(n)) result.quarantined++;

      const { brand, model } = productIdentity(listing.title, n);

      const product = await prisma.product.upsert({
        where: {
          brand_model_capacityBytes: { brand, model, capacityBytes: n.capacityBytes },
        },
        create: {
          brand,
          model,
          capacityBytes: n.capacityBytes,
          technology: n.technology,
          formFactor: toPrismaFormFactor(n.formFactor),
          interface: n.interface,
          rpm: n.rpm,
          confidence: n.confidence,
          shuckable: n.shuckable,
          shuckedEquivalent: n.shuckedEquivalent,
          dictionaryId: n.dictionaryId,
        },
        update: {
          // Keep the most confident reading we have seen for this drive.
          technology: n.technology,
          formFactor: toPrismaFormFactor(n.formFactor),
          interface: n.interface,
          rpm: n.rpm,
          confidence: n.confidence,
          shuckable: n.shuckable,
          shuckedEquivalent: n.shuckedEquivalent,
          dictionaryId: n.dictionaryId,
        },
      });

      const key = `${brand}|${model}|${n.capacityBytes}`;
      if (!seenProducts.has(key)) {
        seenProducts.add(key);
        result.productsUpserted++;
      }

      const existing = await prisma.offer.findUnique({
        where: {
          marketplace_externalId: {
            marketplace: listing.marketplace,
            externalId: listing.externalId,
          },
        },
        select: { id: true, priceCents: true, shippingCents: true },
      });

      const offer = await prisma.offer.upsert({
        where: {
          marketplace_externalId: {
            marketplace: listing.marketplace,
            externalId: listing.externalId,
          },
        },
        create: {
          productId: product.id,
          marketplace: listing.marketplace,
          externalId: listing.externalId,
          condition: listing.condition,
          lotSize: n.lotSize,
          priceCents: listing.priceCents,
          shippingCents: listing.shippingCents,
          shippingIsCalculated: listing.shippingIsCalculated,
          currency: listing.currency,
          locale: listing.locale,
          inStock: listing.inStock,
          sellerName: listing.sellerName,
          sellerScore: listing.sellerScore,
          powerOnHours: n.powerOnHours,
          hasWarranty: n.hasWarranty,
          returnPolicy: n.returnPolicy,
          url: listing.url,
          fetchedAt: now,
          expiresAt,
        },
        update: {
          productId: product.id,
          condition: listing.condition,
          lotSize: n.lotSize,
          priceCents: listing.priceCents,
          shippingCents: listing.shippingCents,
          shippingIsCalculated: listing.shippingIsCalculated,
          inStock: listing.inStock,
          sellerName: listing.sellerName,
          sellerScore: listing.sellerScore,
          powerOnHours: n.powerOnHours,
          hasWarranty: n.hasWarranty,
          returnPolicy: n.returnPolicy,
          url: listing.url,
          fetchedAt: now,
          // Every sweep pushes the expiry out. Miss a sweep and it lapses.
          expiresAt,
        },
      });

      result.offersUpserted++;

      // ONLY when the price actually changed. Writing an observation every
      // sweep would grow this table by the full catalogue size eight times a
      // day for no additional information.
      const changed =
        !existing ||
        existing.priceCents !== listing.priceCents ||
        existing.shippingCents !== listing.shippingCents;

      if (changed) {
        await prisma.pricePoint.create({
          data: {
            offerId: offer.id,
            priceCents: listing.priceCents,
            shippingCents: listing.shippingCents,
            observedAt: now,
          },
        });
        result.pricePointsWritten++;
      }
    }

    logger.info(
      `[ingest] ${adapter.marketplace}: ${unique.size} listings, TTL ${adapter.ttlHours}h`,
    );
  }

  // The hard-delete expiry pass. Structural, not procedural: this is what makes
  // the 24-hour rule true rather than aspirational.
  const deleted = await prisma.offer.deleteMany({ where: { expiresAt: { lte: now } } });
  result.expiredDeleted = deleted.count;

  logger.info(
    `[ingest] done: ${result.offersUpserted} offers, ${result.productsUpserted} products, ${result.pricePointsWritten} price points, ${result.quarantined} quarantined, ${result.rejected} rejected, ${result.expiredDeleted} expired deleted`,
  );

  return result;
}

/**
 * Known trap 11: revalidateTag cannot be called from outside the deployment, so
 * the GitHub Action hits an authenticated route on the Vercel side that calls
 * it. A failure here must not fail the ingest — the data is already written and
 * the cache will lapse on its own.
 */
export async function requestRevalidation(
  siteUrl: string | undefined,
  secret: string | undefined,
  logger: Pick<Console, 'info' | 'warn'> = console,
): Promise<boolean> {
  if (!siteUrl || !secret) {
    logger.info(
      '[ingest] revalidation skipped: NEXT_PUBLIC_SITE_URL or REVALIDATE_SECRET unset',
    );
    return false;
  }

  try {
    const res = await fetch(new URL('/api/cron/refresh', siteUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      logger.warn(`[ingest] revalidation returned ${res.status}`);
      return false;
    }
    logger.info('[ingest] revalidation requested');
    return true;
  } catch (error) {
    logger.warn('[ingest] revalidation failed:', error);
    return false;
  }
}
