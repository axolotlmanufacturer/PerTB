import * as Sentry from '@sentry/nextjs';
import { prisma } from '../src/lib/db';
import {
  dictionaryHitRate,
  requestRevalidation,
  runIngest,
  type IngestResult,
} from '../src/lib/ingest';
import { buildAdapters } from '../src/lib/sources';

/**
 * The 3-hourly sweep. Runs in GitHub Actions, not Vercel Cron: Vercel caps a
 * cron invocation at 300 seconds and a full two-marketplace keyword sweep
 * exceeds it (known trap 4). The Vercel route is a manual trigger only.
 *
 *   pnpm ingest
 */

/**
 * The floor below which a "successful" sweep is not success.
 *
 * A failed job emails you. A job that finishes cleanly having written twelve
 * offers because eBay throttled does not — and the table empties on its own
 * six hours later, because expiry is structural (§1.3). That silence is the
 * gap this closes. Configurable, because the right floor depends on the
 * keyword set and nobody should have to edit code to raise it.
 */
const MIN_HEALTHY_OFFERS = Number(process.env.INGEST_MIN_OFFERS ?? 50);

function reportThin(result: IngestResult): void {
  const message =
    `[ingest] ONLY ${result.offersUpserted} offers written, below the floor of ` +
    `${MIN_HEALTHY_OFFERS}. The table will empty as the current offers expire. ` +
    `Skipped: ${result.skipped.map((s) => `${s.marketplace} (${s.reason})`).join(', ') || 'none'}`;

  console.error(message);
  Sentry.captureMessage(message, 'error');
}

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

  // Dictionary coverage is the lever on how much of the catalogue publishes.
  // Surfaced on every run so a slide is visible before the quarantine queue
  // gets long enough to notice on its own.
  console.info(
    `[ingest] dictionary hit rate ${dictionaryHitRate(result)}% ` +
      `(${result.quarantined} quarantined this sweep)`,
  );

  // The one condition that must fail the job. Everything above is reporting.
  if (result.offersUpserted < MIN_HEALTHY_OFFERS) {
    reportThin(result);
    await Sentry.flush(2000);
    process.exitCode = 1;
  }
}

main()
  .catch(async (error: unknown) => {
    console.error('[ingest] fatal:', error);
    // The sweep runs headless on a cron. Without this the only trace of a
    // crash is a red tick on a workflow nobody is watching at 04:00.
    Sentry.captureException(error);
    await Sentry.flush(2000);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
