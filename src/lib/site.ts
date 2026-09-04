/**
 * Site-level configuration.
 *
 * The brand is a placeholder (brief §3) and is parameterised so renaming the
 * product is an env change, not a find-and-replace across the codebase.
 */

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'perterabyte';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const SITE_TAGLINE =
  'Every HDD and SSD on Amazon and eBay, ranked by price per terabyte.';

/**
 * The Amazon Associates Operating Agreement requires this exact wording
 * wherever Amazon prices are displayed. Ticket 7.5 puts it in the global
 * footer; it lives here so there is one copy of the string.
 */
export const AMAZON_ASSOCIATES_DISCLOSURE =
  'As an Amazon Associate we earn from qualifying purchases.';

/**
 * Applied to every outbound affiliate link. Asserted in a test at ticket 7.5.
 */
export const OUTBOUND_LINK_REL = 'nofollow sponsored noopener';
