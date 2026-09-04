import { createAmazonAdapter, readAmazonConfig } from './amazon';
import { createEbayAdapter, readEbayConfig } from './ebay';
import { createMockAdapter } from './mock';
import type { SourceAdapter } from './types';

/**
 * Builds the adapter set from the environment.
 *
 * The default posture is mock-first: `MOCK_DATA=true` is the default for local
 * dev and CI, so a fresh checkout with no credentials produces a fully
 * populated site.
 *
 * Live adapters are each gated twice — by their *_ENABLED flag and by whether
 * their credentials are actually present. A marketplace that is switched on but
 * unconfigured is skipped with a warning rather than crashing the run, because
 * an ingest that dies on startup empties the whole table.
 */
export function buildAdapters(
  env: Readonly<Record<string, string | undefined>> = process.env,
  logger: Pick<Console, 'info' | 'warn'> = console,
): SourceAdapter[] {
  const mock = env.MOCK_DATA !== 'false';

  if (mock) {
    logger.info('[sources] MOCK_DATA is on — generating listings, no credentials needed');
    return [createMockAdapter('ebay'), createMockAdapter('amazon')];
  }

  const adapters: SourceAdapter[] = [];

  if (env.EBAY_ENABLED === 'true') {
    const config = readEbayConfig(env);
    if (config) {
      adapters.push(createEbayAdapter(config));
    } else {
      logger.warn(
        '[sources] EBAY_ENABLED=true but credentials are incomplete — skipping',
      );
    }
  }

  // Amazon stays off until the account actually qualifies. This is the expected
  // state at launch, not a degraded mode (CLAUDE.md §1.4).
  if (env.AMAZON_ENABLED === 'true') {
    const config = readAmazonConfig(env);
    if (config) {
      adapters.push(createAmazonAdapter(config));
    } else {
      logger.warn(
        '[sources] AMAZON_ENABLED=true but credentials are incomplete — skipping',
      );
    }
  }

  if (adapters.length === 0) {
    logger.warn(
      '[sources] no live adapters configured. Set EBAY_ENABLED=true with credentials, or MOCK_DATA=true.',
    );
  }

  return adapters;
}

export { createAmazonAdapter, readAmazonConfig } from './amazon';
export { createEbayAdapter, readEbayConfig } from './ebay';
export { createMockAdapter, mockListings, resetMockCatalogue } from './mock';
export * from './types';
