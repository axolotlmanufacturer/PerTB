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
export async function loadDriveRows(now: Date = new Date()): Promise<DriveRow[]> {
  const offers = await prisma.offer.findMany({
    where: {
      // Structural, not procedural. A row past its expiry is not displayable,
      // full stop.
      expiresAt: { gt: now },
      // A listing whose specification we could not resolve confidently never
      // reaches a user. It is visible only in /admin/quarantine.
      product: { confidence: { gte: CONFIDENCE_THRESHOLD } },
    },
    select: {
      id: true,
      productId: true,
      marketplace: true,
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
  }));
}
