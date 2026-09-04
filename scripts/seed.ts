import { prisma } from '../src/lib/db';
import { runIngest } from '../src/lib/ingest';
import { HISTORY_WINDOW_DAYS } from '../src/lib/history';
import { createMockAdapter } from '../src/lib/sources/mock';

/**
 * Seeds a local database with the generated catalogue.
 *
 * Always the mock adapters, never the live ones — seeding is a local
 * convenience and must not depend on credentials or spend API quota.
 *
 *   pnpm seed
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refuse to seed anything that is not obviously a local database.
 *
 * The backfill below writes fabricated observations. Fabricated data in the
 * production table would be the exact failure this codebase is built to
 * prevent — a number that is confidently wrong — so the guard is a hard stop
 * rather than a warning, and the override has to be typed out in full.
 */
function assertLocalDatabase(): void {
  if (process.env.ALLOW_REMOTE_SEED === 'yes-i-mean-it') return;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const host = new URL(url).hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === 'postgres') return;

  throw new Error(
    `refusing to seed ${host}: this writes generated listings and fabricated ` +
      `price history. Set ALLOW_REMOTE_SEED=yes-i-mean-it only if you are certain.`,
  );
}

/** Deterministic PRNG, so the same database seeds to the same history twice. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Back-dated PricePoints for the sparkline column (ticket 5.1), and the
 * matching listing ages.
 *
 * A single ingest sweep writes one observation per offer, and one point is not
 * a series — the whole history column would render empty in dev and in CI, and
 * an unexercised path is an untested path.
 *
 * This mirrors the production invariant exactly: a point exists only where the
 * price CHANGED. It walks backwards from each offer's current price, so the
 * most recent value in the series is the real one and the row's $/TB always
 * matches the right-hand end of its own sparkline.
 *
 * It also ages `createdAt`, because a seeded catalogue where every listing
 * appeared in the same millisecond is not a catalogue anyone will ever have.
 * The sitemap dates each route from the newest real change in it (freshness.ts)
 * and would read `now` for all forty-one — indistinguishable, on inspection,
 * from the crawl-time bug that code exists to fix. Each offer is aged to the
 * depth of its own series, so a listing never predates its own history.
 */
async function backfillHistory(now: Date): Promise<{ points: number; aged: number }> {
  // Seeding twice used to stack two fabricated series on top of each other:
  // createMany appends, nothing removed the previous run's points, and the
  // sparklines then drew overlapping histories with a newest observation from
  // whenever the database was last seeded. That is a lie about the data, and
  // it now feeds the sitemap's lastmod as well. Every point in a seeded
  // database is fabricated by definition — assertLocalDatabase has already
  // refused to run anywhere else — so clearing them is safe and makes `pnpm
  // seed` idempotent.
  await prisma.pricePoint.deleteMany({});

  const offers = await prisma.offer.findMany({
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

  const rows: {
    productId: string;
    offerKey: string;
    condition: (typeof offers)[number]['condition'];
    lotSize: number;
    priceCents: number;
    shippingCents: number;
    observedAt: Date;
  }[] = [];

  /**
   * offer id → how many days ago we first saw it.
   *
   * Bucketed to whole days: that is the resolution a crawler reads `lastmod`
   * at, and it turns four hundred single-row updates into ninety.
   */
  const ageDays = new Map<number, string[]>();
  const age = (offerId: string, days: number) => {
    const bucket = Math.max(0, Math.round(days));
    const ids = ageDays.get(bucket);
    if (ids) ids.push(offerId);
    else ageDays.set(bucket, [offerId]);
  };

  for (const offer of offers) {
    const rng = mulberry32(hash(offer.externalId));

    // A quarter of listings are new to us and genuinely have no history. The
    // empty state has to appear in the table or nobody ever looks at it.
    if (rng() < 0.25) {
      // No history, so nothing anchors the age: a fortnight of spread, which
      // is about how long a live eBay listing lasts before it sells.
      //
      // The floor matters. At zero, the newest listing is the instant the seed
      // ran, every landing contains it, and all forty-one table routes collapse
      // to one timestamp equal to the current time — true, but visually
      // identical to the crawl-time bug and useless for exercising the derived
      // path.
      age(offer.id, 1 + rng() * 14);
      continue;
    }

    const depthDays = Math.round(10 + rng() * (HISTORY_WINDOW_DAYS - 10));
    const changes = 1 + Math.floor(rng() * 5);

    // First seen when its own series starts. An offer younger than its
    // observations would be incoherent for that listing, even though history
    // legitimately outlives any single offer at the product level.
    age(offer.id, depthDays);

    let priceCents = offer.priceCents;
    for (let i = 1; i <= changes; i++) {
      // Walking back in time, prices are usually HIGHER: storage gets cheaper.
      // The occasional step the other way keeps the "was cheaper last month"
      // case in the data too.
      const step = rng() < 0.72 ? 1 + rng() * 0.18 : 1 - rng() * 0.1;
      priceCents = Math.max(500, Math.round(priceCents * step));

      const daysAgo = (depthDays * i) / changes;
      rows.push({
        productId: offer.productId,
        offerKey: offer.id,
        condition: offer.condition,
        lotSize: offer.lotSize,
        priceCents,
        shippingCents: offer.shippingCents,
        observedAt: new Date(now.getTime() - daysAgo * DAY_MS),
      });
    }
  }

  if (rows.length > 0) {
    await prisma.pricePoint.createMany({ data: rows });
  }

  // One update per whole-day bucket rather than one per offer: ninety writes
  // instead of four hundred, and the seed is run often enough for that to be
  // worth the Map.
  let aged = 0;
  for (const [days, ids] of ageDays) {
    const createdAt = new Date(now.getTime() - days * DAY_MS);
    await prisma.offer.updateMany({ where: { id: { in: ids } }, data: { createdAt } });
    aged += ids.length;
  }

  return { points: rows.length, aged };
}

async function main(): Promise<void> {
  assertLocalDatabase();

  const now = new Date();
  const result = await runIngest({
    prisma,
    adapters: [createMockAdapter('ebay'), createMockAdapter('amazon')],
    now,
  });

  const { points, aged } = await backfillHistory(now);

  console.info(
    `[seed] ${result.offersUpserted} offers across ${result.productsUpserted} products ` +
      `(${result.quarantined} quarantined, ${result.rejected} rejected), ` +
      `${points} back-dated price points, ${aged} listings aged`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
