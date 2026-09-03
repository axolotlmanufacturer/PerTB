import { prisma } from '../src/lib/db';
import { runIngest } from '../src/lib/ingest';
import { createMockAdapter } from '../src/lib/sources/mock';

/**
 * Seeds a local database with the generated catalogue.
 *
 * Always the mock adapters, never the live ones — seeding is a local
 * convenience and must not depend on credentials or spend API quota.
 *
 *   pnpm seed
 */
async function main(): Promise<void> {
  const result = await runIngest({
    prisma,
    adapters: [createMockAdapter('ebay'), createMockAdapter('amazon')],
  });

  console.info(
    `[seed] ${result.offersUpserted} offers across ${result.productsUpserted} products ` +
      `(${result.quarantined} quarantined, ${result.rejected} rejected)`,
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
