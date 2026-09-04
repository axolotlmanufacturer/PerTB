import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_REL,
  buildAmazonLink,
  buildEbayLink,
  normaliseSubId,
} from '@/lib/affiliate';

/**
 * These assertions are the contract with the affiliate networks, not style
 * preferences. A change that makes one of them fail is a revenue change and
 * needs a human decision, not a fix.
 */

describe('eBay Partner Network links', () => {
  const base = {
    itemWebUrl: 'https://www.ebay.com/itm/123456789012',
    campaignId: '5338888888',
    rotationId: '711-53200-19255-0',
  };

  it('carries every required tracking parameter', () => {
    const url = buildEbayLink({ ...base, subId: 'hdd/nas' });
    for (const required of [
      'mkevt=1',
      'mkcid=1',
      'mkrid=711-53200-19255-0',
      'campid=5338888888',
      'toolid=10001',
      'customid=hdd-nas',
    ]) {
      expect(url, `missing ${required}`).toContain(required);
    }
  });

  it('keeps the parameters in the agreed order', () => {
    const url = buildEbayLink({ ...base, subId: 'home' });
    const order = ['mkevt', 'mkcid', 'mkrid', 'campid', 'toolid', 'customid'];
    const positions = order.map((p) => url.indexOf(`${p}=`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('opens the query string when the item URL has none', () => {
    // An item URL without "?" plus "&mkevt=1" is a link that tracks nothing.
    const url = buildEbayLink({ ...base, subId: null });
    expect(url).toBe(
      'https://www.ebay.com/itm/123456789012?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5338888888&toolid=10001&customid=home',
    );
  });

  it('appends when the item URL already has a query string', () => {
    const url = buildEbayLink({
      ...base,
      itemWebUrl: 'https://www.ebay.com/itm/123456789012?var=987654321',
      subId: null,
    });
    expect(url).toContain('?var=987654321&mkevt=1');
    expect(url.match(/\?/g)).toHaveLength(1);
  });

  it('preserves the item URL untouched', () => {
    const url = buildEbayLink({ ...base, subId: 'ssd/nvme-gen5' });
    expect(url.startsWith(base.itemWebUrl)).toBe(true);
  });
});

describe('Amazon Associates links', () => {
  const base = { asin: 'B08QB93S6R', partnerTag: 'perterabyte-20' };

  it('matches the required format exactly', () => {
    expect(buildAmazonLink({ ...base, subId: 'hdd/20tb' })).toBe(
      'https://www.amazon.com/dp/B08QB93S6R?tag=perterabyte-20&linkCode=ogi&th=1&ascsubtag=hdd-20tb',
    );
  });

  it('carries the tag, linkCode and th parameters', () => {
    const url = buildAmazonLink({ ...base, subId: null });
    expect(url).toContain('tag=perterabyte-20');
    expect(url).toContain('linkCode=ogi');
    expect(url).toContain('th=1');
  });

  it('honours a non-default marketplace host', () => {
    const url = buildAmazonLink({
      ...base,
      marketplace: 'www.amazon.co.uk',
      subId: null,
    });
    expect(url.startsWith('https://www.amazon.co.uk/dp/')).toBe(true);
  });
});

describe('sub-ids attribute revenue to routes', () => {
  it('turns a landing slug into a tracking-safe value', () => {
    expect(normaliseSubId('/hdd/used-enterprise')).toBe('hdd-used-enterprise');
    expect(normaliseSubId('ssd/m2-2230')).toBe('ssd-m2-2230');
  });

  it('falls back to a stable value rather than an empty field', () => {
    expect(normaliseSubId(null)).toBe('home');
    expect(normaliseSubId('')).toBe('home');
    expect(normaliseSubId('///')).toBe('home');
    expect(normaliseSubId('!!!')).toBe('home');
  });

  it('strips characters the networks reject', () => {
    expect(normaliseSubId('HDD/NAS?utm=x')).toBe('hdd-nasutmx');
  });

  it('bounds the length', () => {
    expect(normaliseSubId('a'.repeat(200))).toHaveLength(64);
  });
});

describe('outbound link rel', () => {
  it('is nofollow sponsored noopener', () => {
    expect(AFFILIATE_REL).toBe('nofollow sponsored noopener');
  });
});
