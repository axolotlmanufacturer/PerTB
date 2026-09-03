'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState } from 'react';

/**
 * Analytics, and the consent that gates it (tickets 7.4 and 0.8).
 *
 * Two decisions worth stating, because both are places where sites reach for
 * the cargo cult.
 *
 * **The banner only appears when there is something to consent to.** With no
 * `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` configured nothing loads, nothing is stored,
 * and a banner asking permission for that would be theatre. The affiliate
 * relationship is disclosed in the footer of every page and on its own page —
 * that is informing people, which is a different obligation from consent.
 *
 * **Declining is remembered in the browser, not on a server.** Storing a record
 * of who declined tracking, in order to honour their refusal to be tracked, is
 * a joke that writes itself. localStorage, one key, no identifier.
 *
 * Sentry is not gated here: it captures crashes, carries no advertising
 * identifier and builds no profile. The privacy policy says so explicitly.
 */

const STORAGE_KEY = 'pertb.consent.analytics';

type Decision = 'accepted' | 'declined';

function read(): Decision | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'accepted' || value === 'declined' ? value : null;
  } catch {
    // Private mode, or storage blocked. Treat as undecided, and since nothing
    // is stored we simply never load analytics.
    return null;
  }
}

function write(decision: Decision): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, decision);
  } catch {
    // Nothing to do. The decision holds for this page view either way.
  }
}

export function Consent() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  // null = not read yet (server render and first paint), so nothing renders and
  // there is no hydration mismatch. The banner is position: fixed, so it costs
  // no layout shift when it does appear.
  const [decision, setDecision] = useState<Decision | null | 'unknown'>('unknown');

  useEffect(() => {
    setDecision(read());
  }, []);

  function decide(value: Decision): void {
    write(value);
    setDecision(value);
  }

  if (!domain) return null;

  return (
    <>
      {decision === 'accepted' && (
        <Script
          defer
          data-domain={domain}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      )}

      {decision === null && (
        <div className="consent" role="region" aria-label="Analytics consent">
          <p className="consent__text">
            We use cookieless analytics to count page views. It loads only if you agree,
            and it never identifies you. Outbound links to Amazon and eBay set their own
            tracking — see the <Link href="/legal/privacy">privacy policy</Link>.
          </p>
          <div className="consent__actions">
            <button type="button" className="btn" onClick={() => decide('declined')}>
              Decline
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => decide('accepted')}
            >
              Accept
            </button>
          </div>
        </div>
      )}
    </>
  );
}
