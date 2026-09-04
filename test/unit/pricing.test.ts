import { describe, expect, it } from 'vitest';
import {
  BYTES_PER_TB,
  effectiveCents,
  formatCapacity,
  formatPricePerTb,
  pricePerTbCents,
  pricePerTbDollars,
  totalBytes,
  totalTerabytes,
} from '@/lib/pricing';

const TB = BYTES_PER_TB;
const GB = 1_000_000_000n;

describe('decimal vs binary terabytes (known trap 1)', () => {
  it('treats a 20TB drive as 20 x 10^12 bytes', () => {
    expect(20n * TB).toBe(20_000_000_000_000n);
    expect(totalTerabytes(20n * TB, 1)).toBe(20);
  });

  it('prices against the advertised figure, not the formatted capacity', () => {
    // $279.99 for a 20TB drive, no shipping.
    const perTb = pricePerTbDollars(
      { capacityBytes: 20n * TB, lotSize: 1, priceCents: 27_999, shippingCents: 0 },
      false,
    );
    expect(perTb).toBeCloseTo(14.0, 2);

    // The same drive against TiB would read ~10% higher and look like a bug
    // next to every competitor. Guard the magnitude of the mistake.
    const tibDrive = Number(20n * TB) / 1024 ** 4;
    expect(27_999 / 100 / tibDrive).toBeGreaterThan(perTb * 1.09);
  });
});

describe('shipping', () => {
  const cheapItemExpensivePostage = {
    capacityBytes: 4n * TB,
    lotSize: 1,
    priceCents: 99,
    shippingCents: 2_800,
  };

  it('is included by default', () => {
    expect(effectiveCents(cheapItemExpensivePostage)).toBe(2_899);
    expect(pricePerTbDollars(cheapItemExpensivePostage)).toBeCloseTo(7.2475, 4);
  });

  it('is excluded when the user toggles it off', () => {
    expect(effectiveCents(cheapItemExpensivePostage, false)).toBe(99);
    expect(pricePerTbDollars(cheapItemExpensivePostage, false)).toBeCloseTo(0.2475, 4);
  });

  it('is why the default is on — a $0.99 + $28 listing would top the table', () => {
    // Genuinely cheaper all-in ($25.00 delivered vs $28.99 delivered), but
    // more expensive on the item price alone.
    const honest = {
      capacityBytes: 4n * TB,
      lotSize: 1,
      priceCents: 2_500,
      shippingCents: 0,
    };

    // Shipping excluded: the postage-loaded listing wins, wrongly.
    expect(pricePerTbDollars(cheapItemExpensivePostage, false)).toBeLessThan(
      pricePerTbDollars(honest, false),
    );

    // Shipping included (the default): the honest listing wins.
    expect(pricePerTbDollars(honest)).toBeLessThan(
      pricePerTbDollars(cheapItemExpensivePostage),
    );
  });

  it('treats CALCULATED shipping as zero rather than inventing a figure', () => {
    // Known trap 6: eBay returns no cost for CALCULATED shipping because the
    // buyer's postcode decides it. The adapter flags the offer; pricing sees 0.
    const calculated = {
      capacityBytes: 8n * TB,
      lotSize: 1,
      priceCents: 9_000,
      shippingCents: 0,
    };
    expect(effectiveCents(calculated)).toBe(9_000);
  });
});

describe('lot division (the highest-value rule)', () => {
  it('divides across the lot', () => {
    // "Lot of 5 x 4TB, $260" — the brief's worked example.
    const lot = {
      capacityBytes: 4n * TB,
      lotSize: 5,
      priceCents: 26_000,
      shippingCents: 0,
    };
    expect(totalBytes(4n * TB, 5)).toBe(20n * TB);
    expect(pricePerTbDollars(lot, false)).toBeCloseTo(13.0, 2);
  });

  it('an undetected lot computes to a fifth of the true price', () => {
    // If parseLotSize misses, lotSize stays 1 and the row sits at the top of
    // the table forever, wrong. This is the failure the rule exists to stop.
    const undetected = {
      capacityBytes: 4n * TB,
      lotSize: 1,
      priceCents: 26_000,
      shippingCents: 0,
    };
    const detected = { ...undetected, lotSize: 5 };

    expect(pricePerTbDollars(undetected, false)).toBeCloseTo(65.0, 2);
    expect(pricePerTbDollars(detected, false)).toBeCloseTo(13.0, 2);
    expect(pricePerTbDollars(undetected, false)).toBeCloseTo(
      pricePerTbDollars(detected, false) * 5,
      6,
    );
  });

  it('applies shipping once per listing, not once per drive', () => {
    const lot = {
      capacityBytes: 8n * TB,
      lotSize: 4,
      priceCents: 40_000,
      shippingCents: 2_000,
    };
    expect(effectiveCents(lot)).toBe(42_000);
    expect(pricePerTbDollars(lot)).toBeCloseTo(13.125, 3);
  });
});

describe('formatting', () => {
  it('renders two decimals', () => {
    expect(
      formatPricePerTb({
        capacityBytes: 16n * TB,
        lotSize: 1,
        priceCents: 20_000,
        shippingCents: 0,
      }),
    ).toBe('$12.50');
  });

  it('does not round odd enterprise capacities to a marketing figure', () => {
    // 7.68TB U.3 parts are real and must not display as 8 TB.
    expect(formatCapacity(7_680n * GB)).toBe('7.68 TB');
    expect(formatCapacity(20n * TB)).toBe('20 TB');
    expect(formatCapacity(500n * GB)).toBe('500 GB');
  });
});

describe('input validation — refuse to produce a number we cannot defend', () => {
  const base = { capacityBytes: 4n * TB, lotSize: 1, priceCents: 1000, shippingCents: 0 };

  it('rejects a non-positive capacity', () => {
    expect(() => pricePerTbCents({ ...base, capacityBytes: 0n })).toThrow(RangeError);
    expect(() => pricePerTbCents({ ...base, capacityBytes: -1n })).toThrow(RangeError);
  });

  it('rejects a fractional or zero lot size', () => {
    expect(() => pricePerTbCents({ ...base, lotSize: 0 })).toThrow(RangeError);
    expect(() => pricePerTbCents({ ...base, lotSize: 2.5 })).toThrow(RangeError);
  });

  it('rejects negative money', () => {
    expect(() => pricePerTbCents({ ...base, priceCents: -1 })).toThrow(RangeError);
    expect(() => pricePerTbCents({ ...base, shippingCents: -1 })).toThrow(RangeError);
  });
});
