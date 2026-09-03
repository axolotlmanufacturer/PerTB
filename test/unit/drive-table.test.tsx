import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DriveTable } from '@/components/DriveTable';
import type { HistoryIndex, PriceObservation } from '@/lib/history';
import { EMPTY_QUERY, type Query } from '@/lib/query';
import { buildTable, type DriveRow } from '@/lib/table';

/**
 * Markup tests for the table.
 *
 * These exist because two Phase 5 features cannot currently be seen in the
 * running app: every shuckable external in the catalogue normalises below the
 * publish threshold (see the Phase 5 note in README.md), so /hdd/shuckable
 * renders empty and the delta column never draws. Rendering the component
 * directly is the only way to hold that markup to account until the confidence
 * question is settled.
 *
 * The table is a synchronous server component with no client state, so
 * renderToStaticMarkup gives exactly the HTML the RSC emits.
 */

const TB = 10n ** 12n;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 1, 1, 12, 0, 0);

let seq = 0;
function row(overrides: Partial<DriveRow> = {}): DriveRow {
  seq++;
  return {
    offerId: `o${seq}`,
    productId: `p${seq}`,
    brand: 'Seagate',
    model: 'Exos X20',
    capacityBytes: 20n * TB,
    technology: 'hdd_cmr',
    formFactor: '3.5',
    interface: 'sata3',
    rpm: 7200,
    shuckable: false,
    shuckedEquivalent: null,
    marketplace: 'ebay',
    externalId: `e${seq}`,
    condition: 'new',
    lotSize: 1,
    priceCents: 26_000,
    shippingCents: 0,
    shippingIsCalculated: false,
    inStock: true,
    sellerName: null,
    sellerScore: null,
    powerOnHours: null,
    hasWarranty: null,
    returnPolicy: null,
    url: 'https://www.ebay.com/itm/1',
    ...overrides,
  };
}

function history(
  offerId: string,
  points: [daysAgo: number, priceCents: number][],
): HistoryIndex {
  const observations: PriceObservation[] = points.map(([days, priceCents]) => ({
    at: NOW - days * DAY,
    priceCents,
    shippingCents: 0,
  }));
  return new Map([[offerId, observations]]);
}

function render(
  rows: DriveRow[],
  options: { query?: Query; shuckColumn?: boolean; history?: HistoryIndex } = {},
): string {
  const query = options.query ?? EMPTY_QUERY;
  const view = buildTable(rows, query, { history: options.history, now: NOW });
  return renderToStaticMarkup(
    <DriveTable
      view={view}
      query={query}
      subId="test"
      shuckColumn={options.shuckColumn}
    />,
  );
}

/** React splits `{a} b {c}` into separate text nodes; join them back up. */
function text(html: string): string {
  return html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ');
}

describe('the shucking column (ticket 5.4)', () => {
  const external = row({
    brand: 'WD',
    model: 'Elements Desktop',
    shuckable: true,
    formFactor: 'ext_desktop',
    interface: 'usb_g1',
    priceCents: 20_000,
  });
  const bare = row({ priceCents: 26_000 });
  const shuckableOnly: Query = { ...EMPTY_QUERY, shuckable: true };

  it('renders the vs-bare column only where it was asked for', () => {
    const on = render([external, bare], {
      query: shuckableOnly,
      shuckColumn: true,
    });
    const off = render([external, bare], { query: shuckableOnly });

    expect(on).toContain('vs bare');
    expect(off).not.toContain('vs bare');
  });

  it('states the delta and the price it was measured against', () => {
    // $200/20TB = $10.00/TB against a bare $260/20TB = $13.00/TB.
    const html = render([external, bare], {
      query: shuckableOnly,
      shuckColumn: true,
    });

    expect(text(html)).toContain('−$3.00');
    expect(text(html)).toContain('vs $13.00');
    expect(html).toContain('Seagate Exos X20');
  });

  it('marks a saving green and a premium red', () => {
    const saving = render([external, bare], {
      query: shuckableOnly,
      shuckColumn: true,
    });
    expect(saving).toContain('delta--down');

    // $300 for the 20TB enclosure is $15.00/TB against the bare $13.00/TB.
    const premium = render([row({ ...external, priceCents: 30_000 }), bare], {
      query: shuckableOnly,
      shuckColumn: true,
    });
    expect(premium).toContain('delta--up');
    expect(text(premium)).toContain('+$2.00');
  });

  it('shows a dash, not a zero, when there is no bare equivalent', () => {
    // A zero would read as "the same price", which is a different claim from
    // "we have nothing to compare this against".
    const html = render([external], { query: shuckableOnly, shuckColumn: true });
    expect(text(html)).not.toContain('$0.00');
    expect(html).toContain('No bare drive of this capacity is live right now');
  });

  it('carries the delta as a chip when the column is off', () => {
    const html = render([external, bare], { query: shuckableOnly });
    expect(html).toContain('chip--good');
    expect(text(html)).toContain('shuck −$3.00/TB');
  });
});

describe('the history column (tickets 5.1, 5.2)', () => {
  it('draws a sparkline and links to the detail view', () => {
    const a = row({ offerId: 'a', productId: 'prod-1', condition: 'used' });
    const html = render([a], {
      history: history('a', [
        [60, 34_000],
        [20, 30_000],
        [2, 26_000],
      ]),
    });

    expect(html).toContain('class="spark"');
    expect(html).toContain('href="/drive/prod-1?condition=used"');
    // A real path, not an empty one.
    expect(html).toMatch(/<path class="spark__line" d="M[\d.]+ /);
  });

  it('awards the badge with the window it actually observed', () => {
    const a = row({ offerId: 'a' });
    const html = render([a], {
      history: history('a', [
        [60, 34_000],
        [2, 26_000],
      ]),
    });
    expect(text(html)).toContain('60d low');
  });

  it('says nothing about a window too short to judge', () => {
    const a = row({ offerId: 'a' });
    const html = render([a], {
      history: history('a', [
        [3, 34_000],
        [1, 26_000],
      ]),
    });
    expect(text(html)).not.toContain('d low');
  });

  it('renders an honest blank when nothing has been observed', () => {
    const html = render([row()]);
    expect(html).toContain('No recorded price movement yet');
    expect(html).not.toContain('class="spark"');
  });
});

describe('the table is complete markup', () => {
  it('emits a real <table> with every row present', () => {
    const html = render([row(), row({ model: 'IronWolf Pro' })]);
    expect(html).toContain('<table');
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // header + two rows
  });

  it('never renders a raw marketplace URL — every link is tagged or plain', () => {
    // With no credentials the builders return the plain URL; what must never
    // appear is a half-tagged link.
    const html = render([row()]);
    expect(html).not.toContain('campid=');
    expect(html).toContain('https://www.ebay.com/itm/1');
  });
});
