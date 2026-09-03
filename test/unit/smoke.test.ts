import { describe, expect, it } from 'vitest';
import { AMAZON_ASSOCIATES_DISCLOSURE, OUTBOUND_LINK_REL, SITE_NAME } from '@/lib/site';

describe('phase 0 harness', () => {
  it('resolves the @/* path alias', () => {
    expect(SITE_NAME).toBeTypeOf('string');
    expect(SITE_NAME.length).toBeGreaterThan(0);
  });

  it('carries the Amazon Associates disclosure wording verbatim', () => {
    // Required by the Operating Agreement; ticket 7.5 puts it in the footer.
    expect(AMAZON_ASSOCIATES_DISCLOSURE).toBe(
      'As an Amazon Associate we earn from qualifying purchases.',
    );
  });

  it('marks outbound affiliate links nofollow sponsored noopener', () => {
    // Asserted properly against rendered links at ticket 7.5. This pins the
    // constant so the value cannot drift before then.
    expect(OUTBOUND_LINK_REL).toBe('nofollow sponsored noopener');
  });
});

describe('pricing arithmetic ground truth', () => {
  /*
   * pricing.ts arrives in Phase 1. This test does not import it — it pins the
   * decimal-terabyte convention itself (brief §4.2, known trap 1), so that if
   * anyone later reaches for 2^40 the failure names the reason.
   */
  it('uses decimal terabytes, not binary', () => {
    const TB = 1_000_000_000_000;
    const twentyTbDrive = 20 * TB;
    const priceCents = 27_999;

    const perTb = priceCents / (twentyTbDrive / TB);
    expect(perTb).toBeCloseTo(1399.95, 2);

    // The same drive priced against TiB would read ~10% higher and look like
    // a bug next to every competitor.
    const TiB = 1024 ** 4;
    const perTib = priceCents / (twentyTbDrive / TiB);
    expect(perTib).toBeGreaterThan(perTb * 1.09);
  });
});
