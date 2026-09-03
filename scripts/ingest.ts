import { prisma } from '../src/lib/db';
import { requestRevalidation, runIngest } from '../src/lib/ingest';
import { buildAdapters } from '../src/lib/sources';

/**
 * The 3-hourly sweep. Runs in GitHub Actions, not Vercel Cron: Vercel caps a
 * cron invocation at 300 seconds and a full two-marketplace keyword sweep
 * exceeds it (known trap 4). The Vercel route is a manual trigger only.
 *
 *   pnpm ingest
 */
async function main(): Promise<void> {
  const started = Date.now();

  const adapters = buildAdapters();
  const result = await runIngest({ prisma, adapters });

  await requestRevalidation(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.REVALIDATE_SECRET,
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.info(`[ingest] completed in ${seconds}s`);

  // A marketplace being skipped is normal — Amazon is expected to be
  // unavailable most of the time. Report it, do not fail on it.
  for (const skip of result.skipped) {
    console.info(`[ingest] skipped ${skip.marketplace}: ${skip.reason}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('[ingest] fatal:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
