import { NextResponse } from 'next/server';
import { loadDriveRows } from '@/lib/offers';
import { parseQuery } from '@/lib/query';
import { buildTable } from '@/lib/table';

/**
 * JSON for the facet rail's optimistic refetches.
 *
 * This exists so a facet toggle feels instant. It is NOT how the table is
 * built: the page server-renders complete markup and works with JavaScript
 * disabled. If this route disappeared, the site would still be correct.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const query = parseQuery(new URL(request.url).searchParams);
  const view = buildTable(await loadDriveRows(), query);

  // Known trap 2: BigInt is not JSON-serialisable and throws at RUNTIME, not
  // compile time. capacityBytes is stringified at this boundary — every
  // boundary — and never handed to JSON.stringify as a BigInt.
  return NextResponse.json({
    matchedOffers: view.matchedOffers,
    totalOffers: view.totalOffers,
    floorPptCents: view.floorPptCents,
    facetCounts: view.facetCounts,
    groups: view.groups.map((group) => ({
      key: group.key,
      pricePerTbCents: group.cheapestPptCents,
      offerCount: group.offers.length,
      brand: group.cheapest.brand,
      model: group.cheapest.model,
      capacityBytes: group.cheapest.capacityBytes.toString(),
      technology: group.cheapest.technology,
      formFactor: group.cheapest.formFactor,
      interface: group.cheapest.interface,
      condition: group.cheapest.condition,
      marketplace: group.cheapest.marketplace,
      lotSize: group.cheapest.lotSize,
      priceCents: group.cheapest.priceCents,
      shippingCents: group.cheapest.shippingCents,
      shippingIsCalculated: group.cheapest.shippingIsCalculated,
      powerOnHours: group.cheapest.powerOnHours,
      hasWarranty: group.cheapest.hasWarranty,
      returnPolicy: group.cheapest.returnPolicy,
      shuckable: group.cheapest.shuckable,
      url: group.cheapest.url,
    })),
  });
}
