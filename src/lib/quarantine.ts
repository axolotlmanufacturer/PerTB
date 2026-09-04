import { prisma } from './db';
import { normalise, CONFIDENCE_THRESHOLD } from './normalize';
import { fromPrismaFormFactor } from './prisma-enums';
import type { FormFactor, Interface, Technology } from './taxonomy';

/**
 * The quarantine queue (ticket 7.2).
 *
 * These are the listings the confidence rule withheld. They exist in the
 * database — rejecting them outright would throw away the evidence needed to
 * fix the parser — but every read path filters them out, so nobody sees them
 * except a reviewer here.
 *
 * The point of the review is to fix the CAUSE, not the row. A corrected product
 * helps one drive; the dictionary entry this module proposes alongside it helps
 * every future listing of that family, and it lands in a diff someone can read.
 */

export interface QuarantineOffer {
  offerId: string;
  marketplace: string;
  externalId: string;
  /** Exactly what the marketplace returned. Null for rows predating 7.2. */
  rawTitle: string | null;
  url: string;
  priceCents: number;
  condition: string;
}

export interface QuarantineItem {
  productId: string;
  brand: string;
  model: string;
  capacityBytes: bigint;

  /** What normalisation produced and stored. */
  parsed: {
    technology: Technology | null;
    formFactor: FormFactor | null;
    interface: Interface | null;
    rpm: number | null;
    confidence: number;
    dictionaryId: string | null;
  };

  /**
   * Re-running the parser on the raw title, right now.
   *
   * Almost always identical to `parsed`. When it differs, the dictionary has
   * changed since ingest and the fix has already landed — which is worth seeing
   * before anyone corrects the row by hand.
   */
  reparsed: {
    technology: Technology | null;
    formFactor: FormFactor | null;
    interface: Interface | null;
    confidence: number;
  } | null;

  reviewedAt: Date | null;
  reviewedNote: string | null;

  offers: QuarantineOffer[];
}

/**
 * Sub-threshold, not rejected, oldest first.
 *
 * Oldest first because the queue is worked, not browsed: a listing that has sat
 * unreviewed for a week is the one costing coverage.
 */
export async function loadQuarantine(limit = 100): Promise<QuarantineItem[]> {
  const products = await prisma.product.findMany({
    where: { confidence: { lt: CONFIDENCE_THRESHOLD }, rejected: false },
    orderBy: { createdAt: 'asc' },
    take: limit,
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
      dictionaryId: true,
      reviewedAt: true,
      reviewedNote: true,
      offers: {
        select: {
          id: true,
          marketplace: true,
          externalId: true,
          rawTitle: true,
          url: true,
          priceCents: true,
          condition: true,
        },
        orderBy: { priceCents: 'asc' },
        take: 5,
      },
    },
  });

  return products.map((product) => {
    const rawTitle = product.offers.find((o) => o.rawTitle)?.rawTitle ?? null;
    const n = rawTitle ? normalise(rawTitle) : null;

    return {
      productId: product.id,
      brand: product.brand,
      model: product.model,
      capacityBytes: product.capacityBytes,
      parsed: {
        technology: product.technology,
        formFactor: fromPrismaFormFactor(product.formFactor),
        interface: product.interface,
        rpm: product.rpm,
        confidence: product.confidence,
        dictionaryId: product.dictionaryId,
      },
      reparsed: n
        ? {
            technology: n.technology,
            formFactor: n.formFactor,
            interface: n.interface,
            confidence: n.confidence,
          }
        : null,
      reviewedAt: product.reviewedAt,
      reviewedNote: product.reviewedNote,
      offers: product.offers.map((o) => ({
        offerId: o.id,
        marketplace: o.marketplace,
        externalId: o.externalId,
        rawTitle: o.rawTitle,
        url: o.url,
        priceCents: o.priceCents,
        condition: o.condition,
      })),
    };
  });
}

export interface QuarantineCounts {
  pending: number;
  reviewed: number;
  rejected: number;
}

export async function quarantineCounts(): Promise<QuarantineCounts> {
  const [pending, reviewed, rejected] = await Promise.all([
    prisma.product.count({
      where: { confidence: { lt: CONFIDENCE_THRESHOLD }, rejected: false },
    }),
    prisma.product.count({ where: { reviewedAt: { not: null } } }),
    prisma.product.count({ where: { rejected: true } }),
  ]);
  return { pending, reviewed, rejected };
}

/**
 * The durable half of a correction.
 *
 * Correcting a product fixes one row until its family is listed again under a
 * slightly different title. The fix that lasts is a dictionary entry, and the
 * dictionary is version-controlled on purpose — a correction that alters what
 * the site publishes should arrive as a diff someone can review, not as a
 * database write nobody sees.
 *
 * So this renders the entry and the operator commits it. It deliberately does
 * not write the file: on Vercel the filesystem is read-only, and a review tool
 * that works locally and silently no-ops in production is worse than one that
 * always asks for the same two steps.
 */
export function proposeDictionaryEntry(item: {
  brand: string;
  model: string;
  technology?: Technology | null;
  formFactor?: FormFactor | null;
  interface?: Interface | null;
}): string {
  const id = `${item.brand} ${item.model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // The match term is compiled to a regex with every metacharacter escaped, so
  // a family name carrying a parenthetical — "WD Blue (HDD)" — would only ever
  // match a title that spells the bracket out. Strip it: the proposal has to be
  // something the operator can paste, not something they have to debug.
  const match = item.model
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const entry: Record<string, unknown> = {
    id,
    brand: item.brand,
    family: item.model,
    match: [match],
  };
  if (item.technology) entry.technology = item.technology;
  if (item.formFactor) entry.formFactor = item.formFactor;
  if (item.interface) entry.interface = item.interface;
  entry.confidence = 0.9;
  entry.note = 'Added from /admin/quarantine review. Verify against the datasheet.';

  return JSON.stringify(entry, null, 2);
}
