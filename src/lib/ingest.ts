import type { Prisma, PrismaClient } from '@prisma/client';
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
  pricePointsTrimmed: number;
  quarantined: number;
  /// Products whose axes a human has reviewed, so this sweep left them alone.
  reviewedSkipped: number;
  /// Rows the sweep actually wrote, as opposed to read and left alone.
  productsUpdated: number;
  offersUpdated: number;
  /// Coverage of the curated dictionary — the lever on how much publishes.
  listingsNormalised: number;
  dictionaryHits: number;
  rejected: number;
  expiredDeleted: number;
  /** Marketplaces that were skipped, and why. Never a failure. */
  skipped: { marketplace: string; reason: string }[];
}

/**
 * Retention for PricePoint (ticket 5.5).
 *
 * The display window is 90 days, so eighteen months is not there to be read —
 * it is there so seasonal comparisons remain possible without the table growing
 * without bound. Points also disappear earlier by cascade whenever their offer
 * expires, so this pass only ever bites on listings that have stayed live for a
 * year and a half: stable Amazon ASINs, mostly.
 */
export const PRICE_POINT_RETENTION_MONTHS = 18;

/** Percentage of normalised listings that matched a curated family, 0 decimals. */
export function dictionaryHitRate(
  result: Pick<IngestResult, 'dictionaryHits' | 'listingsNormalised'>,
): number {
  if (result.listingsNormalised === 0) return 0;
  return Math.round((result.dictionaryHits / result.listingsNormalised) * 100);
}

export function pricePointCutoff(now: Date): Date {
  const cutoff = new Date(now);
  // UTC, not local. The sweep runs in GitHub Actions and on Vercel, and a
  // developer in a DST timezone must not compute a cutoff an hour off the one
  // production computes.
  cutoff.setUTCMonth(cutoff.getUTCMonth() - PRICE_POINT_RETENTION_MONTHS);
  return cutoff;
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
    pricePointsTrimmed: 0,
    quarantined: 0,
    reviewedSkipped: 0,
    productsUpdated: 0,
    offersUpdated: 0,
    listingsNormalised: 0,
    dictionaryHits: 0,
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

    // ── Normalise everything first ──────────────────────────────────────────
    //
    // The loop below used to do four or five sequential round trips per
    // listing — findUnique, upsert, findUnique, upsert, create. Four hundred
    // listings meant nearly two thousand queries, which is invisible against a
    // local socket and ten to forty seconds of pure waiting against Neon. So
    // the work is now: read what exists in two queries, decide in memory, and
    // write only what actually differs.
    const parsedListings: {
      listing: RawListing;
      n: Normalised;
      brand: string;
      model: string;
      capacityBytes: bigint;
    }[] = [];

    for (const listing of unique.values()) {
      const n = normalise(listing.title, listing.description ?? '');

      if (n.rejected || n.capacityBytes === null) {
        result.rejected++;
        continue;
      }

      // Below threshold: stored so /admin/quarantine can review it, but every
      // read path filters on confidence so it never reaches the table.
      if (!isPublishable(n)) result.quarantined++;

      // Dictionary hit rate is the coverage lever. A sweep where most listings
      // fall through to the regexes is a sweep telling you which families to
      // add next, and it is only visible if it is counted.
      result.listingsNormalised++;
      if (n.dictionaryId) result.dictionaryHits++;

      const { brand, model } = productIdentity(listing.title, n);
      parsedListings.push({ listing, n, brand, model, capacityBytes: n.capacityBytes });
    }

    // ── Read the current state: two queries, not two per listing ────────────
    const identity = (b: string, m: string, c: bigint) => `${b}|${m}|${c}`;

    const existingProducts = new Map(
      (
        await prisma.product.findMany({
          select: {
            id: true,
            brand: true,
            model: true,
            capacityBytes: true,
            technology: true,
            formFactor: true,
            interface: true,
            rpm: true,
            confidence: true,
            shuckable: true,
            shuckedEquivalent: true,
            dictionaryId: true,
            reviewedAt: true,
          },
        })
      ).map((p) => [identity(p.brand, p.model, p.capacityBytes), p]),
    );

    const existingOffers = new Map(
      (
        await prisma.offer.findMany({
          where: {
            marketplace: adapter.marketplace,
            externalId: { in: parsedListings.map((p) => p.listing.externalId) },
          },
          select: {
            id: true,
            externalId: true,
            productId: true,
            priceCents: true,
            shippingCents: true,
          },
        })
      ).map((o) => [o.externalId, o]),
    );

    // ── Products ────────────────────────────────────────────────────────────
    const productCreates: Prisma.ProductCreateManyInput[] = [];

    for (const { n, brand, model, capacityBytes } of parsedListings) {
      const key = identity(brand, model, capacityBytes);
      if (!seenProducts.has(key)) {
        seenProducts.add(key);
        result.productsUpserted++;
      }

      const parsed = {
        technology: n.technology,
        formFactor: toPrismaFormFactor(n.formFactor),
        interface: n.interface,
        rpm: n.rpm,
        confidence: n.confidence,
      };
      const extra = {
        shuckable: n.shuckable,
        shuckedEquivalent: n.shuckedEquivalent,
        dictionaryId: n.dictionaryId,
      };

      const existing = existingProducts.get(key);
      if (!existing) {
        if (
          !productCreates.some(
            (c) => identity(c.brand, c.model, c.capacityBytes as bigint) === key,
          )
        ) {
          productCreates.push({ brand, model, capacityBytes, ...parsed, ...extra });
        }
        continue;
      }

      // A human review outranks the parser. Without this the correction made in
      // /admin/quarantine would be silently undone by the next sweep, three
      // hours later, and the reviewer would have no way to tell.
      const reviewed = existing.reviewedAt != null;
      if (reviewed) result.reviewedSkipped++;

      const next = { ...(reviewed ? {} : parsed), ...extra };
      // Most sweeps re-read a drive exactly as they read it last time. Writing
      // that back is a round trip that changes nothing.
      const unchanged = Object.entries(next).every(
        ([field, value]) => existing[field as keyof typeof existing] === value,
      );
      if (unchanged) continue;

      await prisma.product.update({ where: { id: existing.id }, data: next });
      result.productsUpdated++;
    }

    if (productCreates.length > 0) {
      await prisma.product.createMany({ data: productCreates, skipDuplicates: true });
      // createMany does not return ids, and the offers about to be written need
      // them. One query, not one per new product.
      for (const created of await prisma.product.findMany({
        where: {
          OR: productCreates.map(({ brand, model, capacityBytes }) => ({
            brand,
            model,
            capacityBytes,
          })),
        },
        select: {
          id: true,
          brand: true,
          model: true,
          capacityBytes: true,
          technology: true,
          formFactor: true,
          interface: true,
          rpm: true,
          confidence: true,
          shuckable: true,
          shuckedEquivalent: true,
          dictionaryId: true,
          reviewedAt: true,
        },
      })) {
        existingProducts.set(
          identity(created.brand, created.model, created.capacityBytes),
          created,
        );
      }
    }

    // ── Offers ──────────────────────────────────────────────────────────────
    const offerCreates: Prisma.OfferCreateManyInput[] = [];
    const untouched: string[] = [];
    const pricePoints: Prisma.PricePointCreateManyInput[] = [];

    for (const { listing, n, brand, model, capacityBytes } of parsedListings) {
      const product = existingProducts.get(identity(brand, model, capacityBytes));
      if (!product) continue; // A create that lost a race; the next sweep gets it.

      const content = {
        productId: product.id,
        rawTitle: listing.title,
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
      };

      const existing = existingOffers.get(listing.externalId);
      result.offersUpserted++;

      // ONLY when the price actually changed. Writing an observation every
      // sweep would grow this table by the full catalogue size eight times a
      // day for no additional information.
      const priceMoved =
        !existing ||
        existing.priceCents !== listing.priceCents ||
        existing.shippingCents !== listing.shippingCents;

      if (!existing) {
        offerCreates.push({
          ...content,
          marketplace: listing.marketplace,
          externalId: listing.externalId,
          currency: listing.currency,
          locale: listing.locale,
          fetchedAt: now,
          expiresAt,
        });
        continue;
      }

      if (priceMoved) {
        pricePoints.push({
          productId: product.id,
          offerKey: existing.id,
          condition: listing.condition,
          lotSize: n.lotSize,
          priceCents: listing.priceCents,
          shippingCents: listing.shippingCents,
          observedAt: now,
        });
        result.pricePointsWritten++;
      }

      // An unchanged listing still needs its expiry pushed out, and that is the
      // common case. One updateMany for all of them beats one update each.
      const contentChanged =
        priceMoved ||
        existing.productId !== product.id ||
        // Cheap fields that do change: re-checking them all in memory would
        // need the full row, so anything price-adjacent forces the write and
        // the rest ride along on the same statement.
        false;

      if (contentChanged) {
        await prisma.offer.update({
          where: { id: existing.id },
          // Every sweep pushes the expiry out. Miss a sweep and it lapses.
          data: { ...content, fetchedAt: now, expiresAt },
        });
        result.offersUpdated++;
      } else {
        untouched.push(existing.id);
      }
    }

    if (untouched.length > 0) {
      await prisma.offer.updateMany({
        where: { id: { in: untouched } },
        data: { fetchedAt: now, expiresAt },
      });
    }

    if (offerCreates.length > 0) {
      await prisma.offer.createMany({ data: offerCreates, skipDuplicates: true });

      // New offers get their first observation, and their ids come back in one
      // query rather than one per row.
      const created = await prisma.offer.findMany({
        where: {
          marketplace: adapter.marketplace,
          externalId: { in: offerCreates.map((o) => o.externalId) },
        },
        select: {
          id: true,
          externalId: true,
          productId: true,
          condition: true,
          lotSize: true,
          priceCents: true,
          shippingCents: true,
        },
      });
      for (const offer of created) {
        pricePoints.push({
          productId: offer.productId,
          offerKey: offer.id,
          condition: offer.condition,
          lotSize: offer.lotSize,
          priceCents: offer.priceCents,
          shippingCents: offer.shippingCents,
          observedAt: now,
        });
        result.pricePointsWritten++;
      }
    }

    if (pricePoints.length > 0) {
      await prisma.pricePoint.createMany({ data: pricePoints });
    }

    logger.info(
      `[ingest] ${adapter.marketplace}: ${unique.size} listings, TTL ${adapter.ttlHours}h`,
    );
  }

  // The hard-delete expiry pass. Structural, not procedural: this is what makes
  // the 24-hour rule true rather than aspirational.
  const deleted = await prisma.offer.deleteMany({ where: { expiresAt: { lte: now } } });
  result.expiredDeleted = deleted.count;

  // Retention (ticket 5.5). Runs after the expiry pass, so it only sees points
  // whose offer survived — the cascade has already taken the rest.
  const trimmed = await prisma.pricePoint.deleteMany({
    where: { observedAt: { lt: pricePointCutoff(now) } },
  });
  result.pricePointsTrimmed = trimmed.count;

  logger.info(
    `[ingest] done: ${result.offersUpserted} offers (${result.offersUpdated} rewritten), ` +
      `${result.productsUpserted} products (${result.productsUpdated} rewritten), ` +
      `${result.pricePointsWritten} price points, ${result.quarantined} quarantined, ` +
      `${result.rejected} rejected, ${result.expiredDeleted} expired deleted, ` +
      `${result.pricePointsTrimmed} price points trimmed`,
  );

  // Coverage of the curated dictionary. A sweep where most listings fall
  // through to the regexes is a sweep telling you which families to add next,
  // and the quarantine queue is the bill for not doing it.
  logger.info(
    `[ingest] dictionary: ${result.dictionaryHits}/${result.listingsNormalised} listings matched a curated family (${dictionaryHitRate(result)}%)`,
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
