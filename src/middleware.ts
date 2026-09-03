import { NextResponse, type NextRequest } from 'next/server';

/**
 * The gate on /admin (ticket 7.2).
 *
 * HTTP Basic. It is the right tool here for three reasons: the browser supplies
 * the form so there is no login page to build and no session to get wrong, it
 * works with JavaScript disabled like everything else on this site, and there
 * is exactly one operator so there is nothing an account system would model.
 *
 * It is only as safe as the transport, which is why the deployment is HTTPS and
 * why the route is also disallowed in robots.txt and marked noindex — an admin
 * page in a search index is a problem regardless of whether it 401s.
 *
 * With ADMIN_PASSWORD unset the route is CLOSED, not open. An unconfigured
 * deployment must never be an unauthenticated one.
 */

const REALM = 'perterabyte admin';

/** Length-independent comparison, so timing does not leak the password. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  // Compare a fixed number of bytes either way; the length difference is folded
  // into the result rather than short-circuiting on it.
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function unauthorised(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export function middleware(request: NextRequest): NextResponse {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return unauthorised();

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorised();

  let decoded: string;
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorised();
  }

  // "user:password" — the username is not checked; there is one operator.
  const supplied = decoded.slice(decoded.indexOf(':') + 1);
  if (!safeEqual(supplied, password)) return unauthorised();

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = { matcher: '/admin/:path*' };
