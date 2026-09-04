import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { CACHE_TAGS, isAuthorised } from '@/lib/cache';

/**
 * Manual trigger and cache-revalidation endpoint.
 *
 * This route does NOT run the ingest sweep. Vercel caps a cron invocation at
 * 300 seconds and a full two-marketplace keyword sweep exceeds it (known trap
 * 4), so ingest runs in GitHub Actions on a 3-hourly cron and this route
 * exists for two things:
 *
 *   1. The Action calls it on completion, because `revalidateTag` cannot be
 *      invoked from outside the deployment (known trap 11).
 *   2. A human can call it to force a cache refresh.
 *
 * Gated on a bearer token. Accepts REVALIDATE_SECRET (used by the Action) or
 * CRON_SECRET (used by a human).
 */

export const dynamic = 'force-dynamic';

export function POST(request: Request): NextResponse {
  const authorised = isAuthorised(
    request.headers.get('authorization'),
    process.env.REVALIDATE_SECRET,
    process.env.CRON_SECRET,
  );

  if (!authorised) {
    // No detail: an unauthenticated caller learns nothing about which secrets
    // are configured.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  for (const tag of CACHE_TAGS) {
    revalidateTag(tag);
  }

  return NextResponse.json({
    revalidated: CACHE_TAGS,
    at: new Date().toISOString(),
  });
}

/** GET is not a mutation surface; say so rather than 404ing confusingly. */
export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'method not allowed', hint: 'POST with an Authorization: Bearer header' },
    { status: 405 },
  );
}
