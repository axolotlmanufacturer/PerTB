import { timingSafeEqual } from 'node:crypto';

/**
 * ISR cache tags.
 *
 * The ingest job invalidates these on completion. Known trap 11:
 * `revalidateTag` cannot be called from outside the deployment, so the GitHub
 * Action posts to an authenticated route on the Vercel side which calls it.
 */
export const OFFERS_TAG = 'offers';

export const CACHE_TAGS = [OFFERS_TAG] as const;

/**
 * Constant-time bearer check.
 *
 * A plain `===` on a secret leaks its prefix through response timing. Cheap to
 * do properly, so do it properly.
 */
export function isAuthorised(
  header: string | null,
  ...accepted: (string | undefined)[]
): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice('Bearer '.length));

  let ok = false;
  for (const secret of accepted) {
    if (!secret) continue;
    const expected = Buffer.from(secret);
    // Compare every candidate rather than returning early, so the number of
    // comparisons does not depend on which secret matched.
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      ok = true;
    }
  }
  return ok;
}
