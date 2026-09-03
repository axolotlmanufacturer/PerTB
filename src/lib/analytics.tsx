import Script from 'next/script';

/**
 * Plausible, wired but inert without `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
 *
 * Plausible is cookieless, which is why it can load before the consent banner
 * exists. Ticket 7.4 adds a minimal consent banner gating analytics; when that
 * lands, this component gets the gate. Affiliate cookies — not this script —
 * are what trigger the EU consent obligation.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  // No key, no script, no network request, no console noise.
  if (!domain) return null;

  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  );
}
