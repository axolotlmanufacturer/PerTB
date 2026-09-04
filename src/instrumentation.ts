import type { Instrumentation } from 'next';

/**
 * Sentry, wired but inert without `SENTRY_DSN` (ticket 0.8).
 *
 * Everything is behind a DSN check and a dynamic import, so a checkout with no
 * Sentry credentials does no initialisation, opens no transport and emits no
 * warnings. `pnpm build` and `pnpm test` are identical with and without keys.
 */
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;

  const runtime = process.env.NEXT_RUNTIME;
  if (runtime === 'nodejs') {
    await import('../sentry.server.config');
  } else if (runtime === 'edge') {
    await import('../sentry.edge.config');
  }
}

/**
 * Next calls this for errors thrown in server components, route handlers and
 * middleware. Without a DSN it is a no-op rather than an unhandled import.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  ...args
): Promise<void> => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
