import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PRICE_POINT_RETENTION_MONTHS, runIngest } from '@/lib/ingest';
import { createMockAdapter, resetMockCatalogue } from '@/lib/sources/mock';
import { AmazonNotEligibleError, type SourceAdapter } from '@/lib/sources/types';

/**
 * Ticket 2.7 — the resilience tests.
 *
 * CLAUDE.md §1.4 calls these load-bearing and says not to delete or skip them.
 * They therefore SKIP locally when there is no database (so a fresh clone can
 * still run `pnpm test`) but FAIL LOUDLY in CI if the database is missing,
 * because a load-bearing test that silently skips is worse than no test.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);

if (!hasDatabase && process.env.CI) {
  throw new Error(
    'DATABASE_URL is not set in CI. The Amazon resilience tests are load-bearing ' +
      '(CLAUDE.md §1.4) and must not be skipped — check the postgres service in ci.yml.',
  );
}

const describeDb = hasDatabase ? describe : describe.skip;

const prisma = hasDatabase
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL! }) })
  : (null as unknown as PrismaClient);

const silent = { info: () => {}, warn: () => {}, error: () => {} };

/** An adapter that fails the way Amazon actually fails. */
function notEligibleAdapter(): SourceAdapter {
  return {
    marketplace: 'amazon',
    enabled: true,
    ttlHours: 24,
    search(): Promise<never> {
      return Promise.reject(new AmazonNotEligibleError());
    },
  };
}

afterAll(async () => {
  if (hasDatabase) await prisma.$disconnect();
});

describeDb('ingest resilience', () => {
  beforeEach(async () => {
    resetMockCatalogue();
    // PricePoint and Offer cascade from their parents.
    await prisma.pricePoint.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.product.deleteMany();
  });

  it('populates the database from eBay alone with Amazon disabled', async () => {
    const result = await runIngest({
      prisma,
      adapters: [
        createMockAdapter('ebay'),
        createMockAdapter('amazon', { enabled: false }),
      ],
      logger: silent,
    });

    expect(result.offersUpserted).toBeGreaterThan(0);
    expect(result.skipped).toContainEqual({ marketplace: 'amazon', reason: 'disabled' });

    const ebay = await prisma.offer.count({ where: { marketplace: 'ebay' } });
    const amazon = await prisma.offer.count({ where: { marketplace: 'amazon' } });

    expect(ebay).toBeGreaterThan(0);
    expect(amazon).toBe(0);

    // The site must be able to render a populated table from this alone.
    const publishable = await prisma.offer.count({
      where: { product: { confidence: { gte: 0.6 } }, expiresAt: { gt: new Date() } },
    });
    expect(publishable).toBeGreaterThan(0);
  });

  it('survives a 403 AssociateNotEligible and keeps the eBay data', async () => {
    const result = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay'), notEligibleAdapter()],
      logger: silent,
    });

    // A warning, never a thrown error and never an empty table.
    expect(result.skipped).toContainEqual({
      marketplace: 'amazon',
      reason: 'AssociateNotEligible',
    });
    expect(result.offersUpserted).toBeGreaterThan(0);

    const publishable = await prisma.offer.count({
      where: { product: { confidence: { gte: 0.6 } }, expiresAt: { gt: new Date() } },
    });
    expect(publishable).toBeGreaterThan(0);
  });

  it('does not let an unrelated marketplace failure empty the table', async () => {
    const exploding: SourceAdapter = {
      marketplace: 'amazon',
      enabled: true,
      ttlHours: 24,
      search: () => Promise.reject(new Error('connection reset')),
    };

    const result = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay'), exploding],
      logger: silent,
    });

    expect(result.offersUpserted).toBeGreaterThan(0);
    expect(result.skipped.map((s) => s.marketplace)).toContain('amazon');
  });
});

describeDb('the 24-hour rule is structural', () => {
  beforeEach(async () => {
    resetMockCatalogue();
    await prisma.pricePoint.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.product.deleteMany();
  });

  it('hard-deletes offers past their expiry', async () => {
    const past = new Date(Date.now() - 26 * 60 * 60 * 1000);

    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      now: past,
      logger: silent,
    });

    const beforeCount = await prisma.offer.count();
    expect(beforeCount).toBeGreaterThan(0);

    // A later sweep that finds nothing must still run the expiry pass.
    const result = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay', { enabled: false })],
      logger: silent,
    });

    expect(result.expiredDeleted).toBe(beforeCount);
    expect(await prisma.offer.count()).toBe(0);
  });

  it('empties the table when ingest stops running, rather than serving stale prices', async () => {
    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      now: new Date(Date.now() - 7 * 60 * 60 * 1000),
      logger: silent,
    });

    // eBay TTL is 6 hours, so everything written 7 hours ago has lapsed.
    const live = await prisma.offer.count({ where: { expiresAt: { gt: new Date() } } });
    expect(live).toBe(0);
  });

  it('pushes the expiry out on every successful sweep', async () => {
    await runIngest({ prisma, adapters: [createMockAdapter('ebay')], logger: silent });
    const first = await prisma.offer.findFirstOrThrow({
      select: { id: true, expiresAt: true },
    });

    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      now: new Date(Date.now() + 60_000),
      logger: silent,
    });
    const second = await prisma.offer.findUniqueOrThrow({
      where: { id: first.id },
      select: { expiresAt: true },
    });

    expect(second.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
  });
});

describeDb('price history', () => {
  beforeEach(async () => {
    resetMockCatalogue();
    await prisma.pricePoint.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.product.deleteMany();
  });

  it('writes an observation only when the price actually changed', async () => {
    const first = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
    });
    expect(first.pricePointsWritten).toBe(first.offersUpserted);

    // Identical sweep: the deterministic catalogue returns the same prices.
    const second = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
    });

    expect(second.offersUpserted).toBe(first.offersUpserted);
    // Not one row. Writing every sweep would grow this table by the full
    // catalogue size eight times a day for no additional information.
    expect(second.pricePointsWritten).toBe(0);
    expect(await prisma.pricePoint.count()).toBe(first.pricePointsWritten);
  });

  it('trims observations past the retention horizon and keeps the rest', async () => {
    const now = new Date();
    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
      now,
    });

    const offer = await prisma.offer.findFirst({
      select: { id: true, productId: true, condition: true, lotSize: true },
    });
    expect(offer).not.toBeNull();

    const base = {
      productId: offer!.productId,
      offerKey: offer!.id,
      condition: offer!.condition,
      lotSize: offer!.lotSize,
    };

    // Two observations either side of the eighteen-month line.
    await prisma.pricePoint.createMany({
      data: [
        {
          ...base,
          priceCents: 111_11,
          observedAt: monthsAgo(now, PRICE_POINT_RETENTION_MONTHS + 1),
        },
        {
          ...base,
          priceCents: 222_22,
          observedAt: monthsAgo(now, PRICE_POINT_RETENTION_MONTHS - 1),
        },
      ],
    });

    const swept = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
      now,
    });

    expect(swept.pricePointsTrimmed).toBe(1);

    const remaining = await prisma.pricePoint.findMany({
      where: { offerKey: offer!.id },
      select: { priceCents: true },
    });
    const prices = remaining.map((p) => p.priceCents);
    expect(prices).toContain(222_22);
    expect(prices).not.toContain(111_11);
  });

  it('keeps a sold listing history after the offer is hard-deleted', async () => {
    // The reason PricePoint hangs off Product. eBay inventory is single-unit,
    // so an offer vanishing is the normal case rather than the exception — and
    // it used to take the whole series with it.
    const now = new Date();
    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
      now,
    });

    const offer = await prisma.offer.findFirst({ select: { id: true, productId: true } });
    expect(offer).not.toBeNull();

    const before = await prisma.pricePoint.count({ where: { offerKey: offer!.id } });
    expect(before).toBeGreaterThan(0);

    await prisma.offer.delete({ where: { id: offer!.id } });

    const after = await prisma.pricePoint.count({ where: { offerKey: offer!.id } });
    expect(after).toBe(before);

    // And it is still attributed to the drive, which is how it gets read back.
    const attributed = await prisma.pricePoint.count({
      where: { productId: offer!.productId },
    });
    expect(attributed).toBeGreaterThan(0);
  });
});

function monthsAgo(from: Date, months: number): Date {
  const date = new Date(from);
  date.setMonth(date.getMonth() - months);
  return date;
}

describeDb('quarantine', () => {
  beforeEach(async () => {
    resetMockCatalogue();
    await prisma.pricePoint.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.product.deleteMany();
  });

  it('stores sub-threshold products for review but keeps them out of the table', async () => {
    const result = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay'), createMockAdapter('amazon')],
      logger: silent,
    });

    expect(result.quarantined).toBeGreaterThan(0);

    const belowThreshold = await prisma.product.count({
      where: { confidence: { lt: 0.6 } },
    });
    expect(belowThreshold).toBeGreaterThan(0);

    // Present for /admin/quarantine, absent from anything a user sees.
    const publishable = await prisma.product.count({
      where: { confidence: { gte: 0.6 } },
    });
    expect(publishable).toBeGreaterThan(0);
  });

  it('never stores an accessory', async () => {
    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
    });

    const accessories = await prisma.product.count({
      where: {
        OR: [
          { model: { contains: 'Enclosure', mode: 'insensitive' } },
          { model: { contains: 'Cable', mode: 'insensitive' } },
          { model: { contains: 'Caddy', mode: 'insensitive' } },
          { model: { contains: 'Docking', mode: 'insensitive' } },
        ],
      },
    });
    expect(accessories).toBe(0);
  });
});

describeDb('the mock catalogue is the size the brief asks for', () => {
  beforeEach(async () => {
    resetMockCatalogue();
    await prisma.pricePoint.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.product.deleteMany();
  });

  it('populates roughly 400 offers', async () => {
    const result = await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay'), createMockAdapter('amazon')],
      logger: silent,
    });
    expect(result.offersUpserted).toBeGreaterThanOrEqual(350);
    expect(result.offersUpserted).toBeLessThanOrEqual(450);
  });

  it('exercises the lot path with real multi-drive listings', async () => {
    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
    });
    const lots = await prisma.offer.count({ where: { lotSize: { gt: 1 } } });
    expect(lots).toBeGreaterThan(0);
  });

  it('includes out-of-stock rows', async () => {
    await runIngest({
      prisma,
      adapters: [createMockAdapter('ebay')],
      logger: silent,
    });
    expect(await prisma.offer.count({ where: { inStock: false } })).toBeGreaterThan(0);
  });
});
