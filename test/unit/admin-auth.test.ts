import { describe, expect, it } from 'vitest';
import { isAuthorisedAdmin, safeEqual } from '@/middleware';

/**
 * The gate on /admin (ticket 7.2).
 *
 * The e2e suite can only prove the 401: CI has no ADMIN_PASSWORD to set. A gate
 * tested only for refusing is a gate that could be refusing everything, so the
 * accepting path is proved here.
 */

const encode = (user: string, password: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('isAuthorisedAdmin', () => {
  it('accepts the configured password, whatever the username', () => {
    // There is one operator; the username is not a second factor and is not
    // checked. Pretending otherwise would be security theatre.
    expect(isAuthorisedAdmin(encode('admin', 's3cret'), 's3cret')).toBe(true);
    expect(isAuthorisedAdmin(encode('', 's3cret'), 's3cret')).toBe(true);
    expect(isAuthorisedAdmin(encode('anyone', 's3cret'), 's3cret')).toBe(true);
  });

  it('rejects the wrong password', () => {
    expect(isAuthorisedAdmin(encode('admin', 'wrong'), 's3cret')).toBe(false);
  });

  it('is CLOSED when no password is configured', () => {
    // The property that matters most: an unconfigured deployment must never be
    // an unauthenticated one.
    expect(isAuthorisedAdmin(encode('admin', 'anything'), undefined)).toBe(false);
    expect(isAuthorisedAdmin(encode('admin', ''), '')).toBe(false);
    expect(isAuthorisedAdmin(null, undefined)).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    expect(isAuthorisedAdmin(null, 's3cret')).toBe(false);
    expect(isAuthorisedAdmin('s3cret', 's3cret')).toBe(false);
    expect(isAuthorisedAdmin('Bearer s3cret', 's3cret')).toBe(false);
    expect(isAuthorisedAdmin('Basic !!!not base64!!!', 's3cret')).toBe(false);
  });

  it('handles a password containing a colon', () => {
    // Only the FIRST colon separates user from password, or a password with a
    // colon in it silently stops working.
    expect(isAuthorisedAdmin(encode('admin', 'a:b:c'), 'a:b:c')).toBe(true);
  });

  it('handles a non-ASCII password', () => {
    expect(isAuthorisedAdmin(encode('admin', 'påsswörd'), 'påsswörd')).toBe(true);
    expect(isAuthorisedAdmin(encode('admin', 'password'), 'påsswörd')).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares by value', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('does not short-circuit on a length difference', () => {
    // The point of the function: an early return on length would leak the
    // password's length through timing.
    expect(safeEqual('a', 'a-much-longer-secret')).toBe(false);
    expect(safeEqual('a-much-longer-secret', 'a')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
