import {
  HISTORY_WINDOW_DAYS,
  historyKey,
  type HistoryIndex,
  type PriceObservation,
} from './history';
import { CONFIDENCE_THRESHOLD } from './normalize';
import { fromPrismaFormFactor } from './prisma-enums';
import { prisma } from './db';
import type { DriveRow } from './table';

/**
 * The single read query.
 *
 * Two filters are non-negotiable and applied here so no caller can forget
 * them:
 *
 *   expiresAt > now()          the 24-hour rule (CLAUDE.md §1.3)
 *   confidence >= threshold    quarantine (CLAUDE.md §1.1)
 *
 * Everything downstream — facet counts, collapse, sorting, dispersion — works
 * on the rows this returns, in memory.
 */
export async function loadDriveRows(
  now: Date = new Date(),
  options: { productId?: string } = {},
): Promise<DriveRow[]> {
  const offers = await prisma.offer.findMany({
    where: {
      // Structural, not procedural. A row past its expiry is not displayable,
      // full stop.
      expiresAt: { gt: now },
      // A listing whose specification we could not resolve confidently never
      // reaches a user. It is visible only in /admin/quarantine.
      product: { confidence: { gte: CONFIDENCE_THRESHOLD }, rejected: false },
      // The detail view narrows to one drive. Everything else about the query
      // — both filters above included — stays identical, so a product page
      // cannot show a row the table would have withheld.
      ...(options.productId ? { productId: options.productId } : {}),
    },
    select: {
      id: true,
      productId: true,
      marketplace: true,
      externalId: true,
      condition: true,
      lotSize: true,
      priceCents: true,
      shippingCents: true,
      shippingIsCalculated: true,
      inStock: true,
      sellerName: true,
      sellerScore: true,
      powerOnHours: true,
      hasWarranty: true,
      returnPolicy: true,
      url: true,
      // Deliberately createdAt and not fetchedAt: the sweep pushes fetchedAt
      // forward on every listing it still sees, so it says "we looked", not
      // "this changed". See freshness.ts.
      createdAt: true,
      product: {
        select: {
          brand: true,
          model: true,
          capacityBytes: true,
          technology: true,
          formFactor: true,
          interface: true,
          rpm: true,
          shuckable: true,
          shuckedEquivalent: true,
        },
      },
    },
  });

  return offers.map((offer) => ({
    offerId: offer.id,
    productId: offer.productId,

    brand: offer.product.brand,
    model: offer.product.model,
    capacityBytes: offer.product.capacityBytes,
    technology: offer.product.technology,
    // ff_3_5 back to "3.5" — see prisma-enums.ts.
    formFactor: fromPrismaFormFactor(offer.product.formFactor),
    interface: offer.product.interface,
    rpm: offer.product.rpm,
    shuckable: offer.product.shuckable,
    shuckedEquivalent: offer.product.shuckedEquivalent,

    marketplace: offer.marketplace,
    externalId: offer.externalId,
    condition: offer.condition,
    lotSize: offer.lotSize,
    priceCents: offer.priceCents,
    shippingCents: offer.shippingCents,
    shippingIsCalculated: offer.shippingIsCalculated,
    inStock: offer.inStock,

    sellerName: offer.sellerName,
    sellerScore: offer.sellerScore,
    powerOnHours: offer.powerOnHours,
    hasWarranty: offer.hasWarranty,
    returnPolicy: offer.returnPolicy,

    url: offer.url,
    firstSeenAt: offer.createdAt,
  }));
}

/**
 * The 90-day price history for live, publishable products (ticket 5.1).
 *
 * One query, indexed on (productId, condition, observedAt), mirroring the two
 * non-negotiable filters in `loadDriveRows` — a quarantined or rejected product
 * has no display surface, so loading its history would be work done for
 * nothing.
 *
 * The volume stays modest because a PricePoint is written only when a price
 * actually moves (CLAUDE.md §3.4); writing one every sweep would make this
 * query eight times the catalogue per day.
 *
 * History now hangs off the Product, so it survives the offer being
 * hard-deleted on expiry — a sold eBay listing no longer takes its own history
 * with it.
 */
export async function loadPriceHistory(
  now: Date = new Date(),
  options: { productId?: string; windowDays?: number } = {},
): Promise<HistoryIndex> {
  const { productId, windowDays = HISTORY_WINDOW_DAYS } = options;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const points = await prisma.pricePoint.findMany({
    where: {
      observedAt: { gte: since },
      product: {
        confidence: { gte: CONFIDENCE_THRESHOLD },
        rejected: false,
        ...(productId ? { id: productId } : {}),
      },
    },
    select: {
      productId: true,
      condition: true,
      offerKey: true,
      lotSize: true,
      priceCents: true,
      shippingCents: true,
      observedAt: true,
    },
    orderBy: { observedAt: 'asc' },
  });

  const index = new Map<string, PriceObservation[]>();
  for (const point of points) {
    const observation: PriceObservation = {
      at: point.observedAt.getTime(),
      offerKey: point.offerKey,
      lotSize: point.lotSize,
      priceCents: point.priceCents,
      shippingCents: point.shippingCents,
    };
    const key = historyKey(point.productId, point.condition);
    const existing = index.get(key);
    if (existing) existing.push(observation);
    else index.set(key, [observation]);
  }
  return index;
}

/** One product's live offers, for the history detail view (ticket 5.3). */
export async function loadProductRows(
  productId: string,
  now: Date = new Date(),
): Promise<DriveRow[]> {
  return loadDriveRows(now, { productId });
}
