import * as Sentry from '@sentry/nextjs';

/**
 * Imported only when `SENTRY_DSN` is set — see src/instrumentation.ts.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
