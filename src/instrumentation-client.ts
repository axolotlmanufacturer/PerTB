import * as Sentry from '@sentry/nextjs';

/**
 * Browser-side Sentry. Inert without `NEXT_PUBLIC_SENTRY_DSN`.
 *
 * The server DSN (`SENTRY_DSN`) is deliberately not reused here: a value read
 * in the browser has to be inlined into the client bundle at build time, so it
 * needs the `NEXT_PUBLIC_` prefix to be visible at all. Leave it unset and the
 * client reports nothing, which is the default posture.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Free tier. Sampling stays conservative so a traffic spike cannot burn
    // the monthly quota in an afternoon.
    tracesSampleRate: 0.1,
    // No session replay: it would capture the table, and there is no
    // conversion insight in it worth the payload or the privacy surface.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  });
}

export const onRouterTransitionStart = dsn
  ? Sentry.captureRouterTransitionStart
  : undefined;
