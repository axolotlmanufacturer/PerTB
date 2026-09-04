import { beforeEach, describe, expect, it } from 'vitest';
import { mapItem as mapAmazonItem, readAmazonConfig } from '@/lib/sources/amazon';
import {
  mapItem as mapEbayItem,
  passesSellerFloor,
  readEbayConfig,
  readShipping,
} from '@/lib/sources/ebay';
import { createMockAdapter, mockListings, resetMockCatalogue } from '@/lib/sources/mock';
import { buildAdapters } from '@/lib/sources';
import { AmazonNotEligibleError, SEARCH_KEYWORDS } from '@/lib/sources/types';
import { normalise } from '@/lib/normalize';

const silent = { info: () => {}, warn: () => {} };

describe('eBay adapter mapping', () => {
  const item = {
    legacyItemId: '123456789012',
    title: 'Seagate Exos X16 16TB SAS 12Gb/s 3.5" Enterprise HDD',
    itemWebUrl: 'https://www.ebay.com/itm/123456789012',
    price: { value: '129.99', currency: 'USD' },
    condition: 'Used',
    seller: {
      username: 'serverpartdeals',
      feedbackPercentage: '99.4',
      feedbackScore: 51234,
    },
  };

  it('maps a well-formed item', () => {
    const listing = mapEbayItem(item);
    expect(listing).not.toBeNull();
    expect(listing?.externalId).toBe('123456789012');
    expect(listing?.priceCents).toBe(12999);
    expect(listing?.condition).toBe('used');
    expect(listing?.marketplace).toBe('ebay');
  });

  it('drops an item missing an id, title or URL rather than guessing', () => {
    expect(mapEbayItem({ ...item, title: undefined })).toBeNull();
    expect(mapEbayItem({ ...item, itemWebUrl: undefined })).toBeNull();
    expect(
      mapEbayItem({ ...item, legacyItemId: undefined, itemId: undefined }),
    ).toBeNull();
  });

  it('drops an item with no usable price', () => {
    expect(mapEbayItem({ ...item, price: { value: '0' } })).toBeNull();
    expect(mapEbayItem({ ...item, price: undefined })).toBeNull();
  });

  it('maps refurbished to renewed, not used', () => {
    expect(mapEbayItem({ ...item, condition: 'Seller Refurbished' })?.condition).toBe(
      'renewed',
    );
    expect(mapEbayItem({ ...item, condition: 'New' })?.condition).toBe('new');
  });
});

describe('CALCULATED shipping is flagged, never invented (known trap 6)', () => {
  it('returns zero and sets the flag', () => {
    const result = readShipping({
      shippingOptions: [{ shippingCostType: 'CALCULATED' }],
    });
    expect(result).toEqual({ shippingCents: 0, shippingIsCalculated: true });
  });

  it('reads a real fixed cost', () => {
    const result = readShipping({
      shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '12.50' } }],
    });
    expect(result).toEqual({ shippingCents: 1250, shippingIsCalculated: false });
  });

  it('treats free shipping as genuinely zero, not calculated', () => {
    const result = readShipping({
      shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '0.0' } }],
    });
    expect(result).toEqual({ shippingCents: 0, shippingIsCalculated: false });
  });
});

describe('seller quality floor', () => {
  const config = { minFeedbackPct: 98.5, minFeedbackCount: 50 };

  it('accepts a seller above both thresholds', () => {
    expect(
      passesSellerFloor({ feedbackPercentage: '99.2', feedbackScore: 4000 }, config),
    ).toBe(true);
  });

  it('rejects on feedback percentage', () => {
    expect(
      passesSellerFloor({ feedbackPercentage: '97.9', feedbackScore: 4000 }, config),
    ).toBe(false);
  });

  it('rejects on feedback count', () => {
    expect(
      passesSellerFloor({ feedbackPercentage: '100', feedbackScore: 12 }, config),
    ).toBe(false);
  });

  it('rejects a seller with no feedback data rather than assuming the best', () => {
    expect(passesSellerFloor(undefined, config)).toBe(false);
    expect(passesSellerFloor({}, config)).toBe(false);
  });
});

describe('Amazon adapter mapping', () => {
  const item = {
    asin: 'B08QB93S6R',
    itemInfo: { title: { displayValue: 'Samsung 990 PRO 2TB NVMe M.2 2280 SSD' } },
    offersV2: {
      listings: [
        {
          condition: { value: 'New' },
          price: { money: { amount: 169.99, currencyCode: 'USD' } },
          availability: { type: 'IN_STOCK' },
          isBuyBoxWinner: true,
        },
      ],
    },
  };

  it('maps a well-formed item', () => {
    const listing = mapAmazonItem(item, 'www.amazon.com');
    expect(listing?.externalId).toBe('B08QB93S6R');
    expect(listing?.priceCents).toBe(16999);
    expect(listing?.marketplace).toBe('amazon');
  });

  it('survives an absent ItemInfo.Title (known trap 9)', () => {
    expect(mapAmazonItem({ ...item, itemInfo: undefined }, 'www.amazon.com')).toBeNull();
    expect(mapAmazonItem({ ...item, itemInfo: {} }, 'www.amazon.com')).toBeNull();
  });

  it('never adds shipping on top of a delivered price (known trap 7)', () => {
    // Amazon feed prices are delivered-price for Prime items; adding an
    // estimate would double-count.
    expect(mapAmazonItem(item, 'www.amazon.com')?.shippingCents).toBe(0);
  });

  it('prefers the buy-box listing', () => {
    const multi = {
      ...item,
      offersV2: {
        listings: [
          {
            price: { money: { amount: 999 } },
            isBuyBoxWinner: false,
            condition: { value: 'Used' },
          },
          {
            price: { money: { amount: 169.99 } },
            isBuyBoxWinner: true,
            condition: { value: 'New' },
          },
        ],
      },
    };
    expect(mapAmazonItem(multi, 'www.amazon.com')?.priceCents).toBe(16999);
  });

  it('drops an item with no offer', () => {
    expect(mapAmazonItem({ ...item, offersV2: undefined }, 'www.amazon.com')).toBeNull();
  });
});

describe('config reading refuses partial credentials', () => {
  it('returns null when eBay credentials are incomplete', () => {
    expect(readEbayConfig({ EBAY_CLIENT_ID: 'x' })).toBeNull();
    expect(readEbayConfig({ EBAY_CLIENT_ID: 'x', EBAY_CLIENT_SECRET: 'y' })).toBeNull();
    expect(
      readEbayConfig({
        EBAY_CLIENT_ID: 'x',
        EBAY_CLIENT_SECRET: 'y',
        EPN_CAMPAIGN_ID: '5338888888',
      }),
    ).not.toBeNull();
  });

  it('returns null when Amazon credentials are incomplete', () => {
    expect(readAmazonConfig({ AMAZON_CREDENTIAL_ID: 'x' })).toBeNull();
    expect(
      readAmazonConfig({
        AMAZON_CREDENTIAL_ID: 'x',
        AMAZON_CREDENTIAL_SECRET: 'y',
        AMAZON_PARTNER_TAG: 'tag-20',
      }),
    ).not.toBeNull();
  });
});

describe('adapter selection', () => {
  it('defaults to mock, so a fresh checkout works with no credentials', () => {
    const adapters = buildAdapters({}, silent);
    expect(adapters.map((a) => a.marketplace).sort()).toEqual(['amazon', 'ebay']);
  });

  it('skips a marketplace that is enabled but unconfigured, rather than crashing', () => {
    // An ingest that dies on startup empties the whole table.
    const adapters = buildAdapters({ MOCK_DATA: 'false', EBAY_ENABLED: 'true' }, silent);
    expect(adapters).toHaveLength(0);
  });

  it('leaves Amazon off unless explicitly enabled', () => {
    const adapters = buildAdapters(
      {
        MOCK_DATA: 'false',
        EBAY_ENABLED: 'true',
        EBAY_CLIENT_ID: 'x',
        EBAY_CLIENT_SECRET: 'y',
        EPN_CAMPAIGN_ID: '5338888888',
      },
      silent,
    );
    expect(adapters.map((a) => a.marketplace)).toEqual(['ebay']);
  });

  it('gives each marketplace its contractual TTL', () => {
    const adapters = buildAdapters({}, silent);
    const byMarket = Object.fromEntries(adapters.map((a) => [a.marketplace, a.ttlHours]));
    expect(byMarket.ebay).toBe(6);
    // 24 hours is the Operating Agreement ceiling, not a tuning knob.
    expect(byMarket.amazon).toBe(24);
  });
});

describe('mock catalogue', () => {
  it('is deterministic between runs', () => {
    resetMockCatalogue();
    const a = mockListings().map((l) => `${l.externalId}:${l.priceCents}`);
    resetMockCatalogue();
    const b = mockListings().map((l) => `${l.externalId}:${l.priceCents}`);
    expect(a).toEqual(b);
  });

  it('generates roughly 400 listings', () => {
    resetMockCatalogue();
    expect(mockListings().length).toBeGreaterThanOrEqual(400);
  });

  it('covers the whole catalogue across the keyword sweep exactly once', async () => {
    resetMockCatalogue();
    const adapter = createMockAdapter('ebay');
    const seen = new Set<string>();
    let total = 0;
    for (const keyword of SEARCH_KEYWORDS) {
      const batch = await adapter.search(keyword);
      total += batch.length;
      for (const l of batch) seen.add(l.externalId);
    }
    const mine = mockListings().filter((l) => l.marketplace === 'ebay');
    expect(seen.size).toBe(mine.length);
    // Disjoint: no listing returned by two keywords.
    expect(total).toBe(mine.length);
  });

  it('exercises the paths the brief names', () => {
    resetMockCatalogue();
    const listings = mockListings();
    const normalised = listings.map((l) => normalise(l.title, l.description ?? ''));

    // Real multi-drive lots, or the highest-value rule is never tested.
    expect(normalised.filter((n) => n.lotSize > 1).length).toBeGreaterThan(0);
    // Out-of-stock rows.
    expect(listings.filter((l) => !l.inStock).length).toBeGreaterThan(0);
    // Used stock skewed to enterprise families.
    expect(listings.filter((l) => l.condition === 'used').length).toBeGreaterThan(0);
    expect(listings.filter((l) => l.condition === 'renewed').length).toBeGreaterThan(0);
    // Accessories that must be rejected rather than ranked.
    expect(normalised.filter((n) => n.rejected).length).toBeGreaterThan(0);
    // Power-on hours, so the used-risk columns have something to show.
    expect(normalised.filter((n) => n.powerOnHours !== null).length).toBeGreaterThan(0);
    // Titles messy enough that some genuinely quarantine.
    expect(normalised.filter((n) => n.confidence < 0.6).length).toBeGreaterThan(0);
  });

  it('produces prices that are plausible per terabyte', () => {
    resetMockCatalogue();
    const hdds = mockListings().filter((l) => /IronWolf|Exos|Ultrastar/.test(l.title));
    expect(hdds.length).toBeGreaterThan(0);
    for (const l of hdds) {
      expect(l.priceCents).toBeGreaterThan(0);
      expect(l.priceCents).toBeLessThan(5_000_00);
    }
  });

  /**
   * The mock has to reproduce the market's actual shape, not just its units.
   *
   * It used to price enterprise families at used-market rates and then apply
   * the used discount on top, so a "new" Exos undercut every shuckable
   * external. `/hdd/shuckable` then demonstrated the opposite of its own
   * premise — the most-searched insight in the niche, shown backwards, in the
   * one place a reader goes to check it.
   */
  describe('reproduces the market’s shape, not just its units', () => {
    /** $/TB for one generated listing, through the real normalisation path. */
    function perTb(listing: (typeof list)[number]): number | null {
      const n = normalise(listing.title, listing.description ?? '');
      if (n.rejected || n.capacityBytes === null) return null;
      const tb = (Number(n.capacityBytes) * n.lotSize) / 1e12;
      return listing.priceCents / 100 / tb;
    }

    let list: ReturnType<typeof mockListings>;
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

    function medianPerTb(match: RegExp, condition: string): number {
      const values = list
        .filter((l) => l.condition === condition && match.test(l.title))
        .map(perTb)
        .filter((v): v is number => v !== null);
      expect(values.length).toBeGreaterThan(2);
      return median(values);
    }

    beforeEach(() => {
      resetMockCatalogue();
      list = mockListings();
    });

    it('prices new enterprise drives at retail, not at pull prices', () => {
      // A sealed Exos or Ultrastar is a ~$17-19/TB drive; the median here is
      // $19.14. The old baselines put it at about $12.50, which is a pull
      // price, so the floor is set where drifting back would trip it.
      const newEnterprise = medianPerTb(/Exos|Ultrastar/, 'new');
      expect(newEnterprise).toBeGreaterThan(15);
      expect(newEnterprise).toBeLessThan(30);
    });

    it('shucking beats a NEW bare drive, which is the whole insight', () => {
      const external = medianPerTb(/easystore|Elements|Expansion/, 'new');
      const bare = medianPerTb(/Exos|Ultrastar|IronWolf|WD Red/, 'new');
      expect(external).toBeLessThan(bare);
    });

    it('and loses to a used enterprise pull, which is the nuance', () => {
      // The received wisdom is that shucking always wins. It does not: a
      // datacentre pull is cheaper per terabyte than any sealed external, and
      // a table that hid that would be selling the reader the wrong drive.
      const external = medianPerTb(/easystore|Elements|Expansion/, 'new');
      const pull = medianPerTb(/Exos|Ultrastar/, 'used');
      expect(pull).toBeLessThan(external);
    });

    it('discounts a datacentre pull far more steeply than a consumer drive', () => {
      const enterpriseDrop =
        medianPerTb(/Exos|Ultrastar/, 'used') / medianPerTb(/Exos|Ultrastar/, 'new');
      const consumerDrop =
        medianPerTb(/BarraCuda|WD Blue|WD Red/, 'used') /
        medianPerTb(/BarraCuda|WD Blue|WD Red/, 'new');
      expect(enterpriseDrop).toBeLessThan(consumerDrop);
    });
  });
});

describe('AmazonNotEligibleError', () => {
  it('is distinguishable from an ordinary failure', () => {
    const err = new AmazonNotEligibleError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AmazonNotEligibleError');
    expect(new Error('boom') instanceof AmazonNotEligibleError).toBe(false);
  });
});
