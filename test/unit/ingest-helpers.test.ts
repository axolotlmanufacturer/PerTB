import { afterEach, describe, expect, it, vi } from 'vitest';
import { productIdentity, requestRevalidation } from '@/lib/ingest';
import { isAuthorised, OFFERS_TAG } from '@/lib/cache';
import { normalise } from '@/lib/normalize';

const silent = { info: () => {}, warn: () => {} };

describe('productIdentity', () => {
  it('prefers the curated brand and family', () => {
    const title = 'Seagate IronWolf Pro 20TB NAS Internal HDD CMR 3.5" SATA 7200 RPM';
    expect(productIdentity(title, normalise(title))).toEqual({
      brand: 'Seagate',
      model: 'IronWolf Pro',
    });
  });

  it('uses the family name as the model, so one drive is one product', () => {
    // The same drive written three ways must collapse to one Product row.
    const variants = [
      'Seagate IronWolf Pro 20TB NAS Internal HDD CMR 3.5" SATA 7200 RPM 256MB',
      'SEAGATE Ironwolf Pro 20 TB NAS Hard Drive 3.5 inch SATA 7200RPM',
      'Seagate IronWolf Pro ST20000NE000 20TB 3.5" SATA NAS HDD CMR',
    ];
    const identities = variants.map((t) => productIdentity(t, normalise(t)));
    expect(new Set(identities.map((i) => `${i.brand}|${i.model}`)).size).toBe(1);
  });

  it('falls back to a conservative slug without a dictionary hit', () => {
    const title = 'Acme Superdrive 9000 4TB internal hard drive 3.5 inch SATA';
    const identity = productIdentity(title, normalise(title));
    expect(identity.brand).toBeTruthy();
    expect(identity.model).toBeTruthy();
    // The capacity must not be part of the model: capacity is its own column,
    // and baking it in would create a separate Product per capacity of the
    // same family under a name that already excludes it.
    expect(identity.model).not.toMatch(/\d+\s*TB/i);
  });

  it('keeps genuinely different drives apart', () => {
    const a = 'Acme Superdrive 9000 4TB internal hard drive 3.5 inch SATA';
    const b = 'Zenith Megastore 100 4TB internal hard drive 3.5 inch SATA';
    const ia = productIdentity(a, normalise(a));
    const ib = productIdentity(b, normalise(b));
    expect(`${ia.brand}|${ia.model}`).not.toBe(`${ib.brand}|${ib.model}`);
  });
});

describe('requestRevalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips quietly when the site URL or secret is unset', async () => {
    expect(await requestRevalidation(undefined, 'secret', silent)).toBe(false);
    expect(await requestRevalidation('https://example.com', undefined, silent)).toBe(
      false,
    );
  });

  it('posts to the authenticated route with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await requestRevalidation('https://example.com', 's3cret', silent)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://example.com/api/cron/refresh');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer s3cret');
  });

  it('does not fail the ingest when revalidation fails', async () => {
    // The data is already written; the cache lapses on its own.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await requestRevalidation('https://example.com', 's3cret', silent)).toBe(
      false,
    );

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    expect(await requestRevalidation('https://example.com', 's3cret', silent)).toBe(
      false,
    );
  });
});

describe('cron route authorisation', () => {
  it('accepts either configured secret', () => {
    expect(isAuthorised('Bearer alpha', 'alpha', 'beta')).toBe(true);
    expect(isAuthorised('Bearer beta', 'alpha', 'beta')).toBe(true);
  });

  it('rejects a wrong, missing or malformed token', () => {
    expect(isAuthorised('Bearer wrong', 'alpha')).toBe(false);
    expect(isAuthorised(null, 'alpha')).toBe(false);
    expect(isAuthorised('alpha', 'alpha')).toBe(false);
    expect(isAuthorised('Basic alpha', 'alpha')).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    // An unconfigured deployment must not be an open endpoint.
    expect(isAuthorised('Bearer anything', undefined, undefined)).toBe(false);
    expect(isAuthorised('Bearer ', undefined)).toBe(false);
  });

  it('does not leak the secret length through an early return', () => {
    expect(isAuthorised('Bearer a', 'a-much-longer-secret')).toBe(false);
  });

  it('names the tag the table is cached under', () => {
    expect(OFFERS_TAG).toBe('offers');
  });
});
