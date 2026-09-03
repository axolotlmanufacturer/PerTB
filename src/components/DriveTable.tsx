import { AFFILIATE_REL } from '@/lib/affiliate';
import { outboundUrl } from '@/lib/outbound';
import { formatCapacity, formatDollars } from '@/lib/pricing';
import type { Query } from '@/lib/query';
import type { DriveRow, OfferGroup, TableView } from '@/lib/table';
import { CONDITION, MARKETPLACE, TECHNOLOGY, labelFor } from '@/lib/taxonomy';

/**
 * The table. A SERVER component, emitting complete markup.
 *
 * This is the entire product. It must be present and correct in the initial
 * HTML with JavaScript disabled — the business model is organic search for
 * long-tail comparison queries, so Googlebot's first paint cannot be an empty
 * table (CLAUDE.md §6). Nothing here is client-side.
 *
 * Expanding an offer group uses <details>, which is native HTML and works
 * without JavaScript.
 */

function ppt(cents: number): string {
  return formatDollars(cents / 100);
}

/** Used rows must let the buyer see the risk they are taking (§3.7). */
function RiskCell({ row }: { row: DriveRow }) {
  if (row.condition === 'new') return <td style={td} />;

  const bits: string[] = [];
  if (row.powerOnHours !== null) {
    bits.push(`${row.powerOnHours.toLocaleString('en-US')} h`);
  }
  if (row.hasWarranty === false) bits.push('no warranty');
  else if (row.hasWarranty === true) bits.push('warranty');
  if (row.returnPolicy) bits.push(row.returnPolicy.toLowerCase());

  return (
    <td style={{ ...td, color: 'var(--fg-muted)', fontSize: '12px' }}>
      {bits.length > 0 ? bits.join(' · ') : '—'}
    </td>
  );
}

/**
 * Every outbound link is built here, tagged with the sub-id of the route the
 * visitor is on. Rendering `row.url` directly would produce links that work
 * perfectly and earn nothing.
 */
function OfferLink({
  row,
  subId,
  children,
}: {
  row: DriveRow;
  subId: string;
  children: React.ReactNode;
}) {
  return (
    <a href={outboundUrl(row, subId)} target="_blank" rel={AFFILIATE_REL}>
      {children}
    </a>
  );
}

function GroupRow({
  group,
  query,
  subId,
}: {
  group: OfferGroup;
  query: Query;
  subId: string;
}) {
  const row = group.cheapest;
  const count = group.offers.length;
  const totalTb = (Number(row.capacityBytes) * row.lotSize) / 1e12;

  return (
    <tr>
      <td style={{ ...td, whiteSpace: 'nowrap' }} className="tabular">
        <strong>{ppt(group.cheapestPptCents)}</strong>
        <span style={{ color: 'var(--fg-muted)' }}>/TB</span>
      </td>

      <td style={td}>
        <OfferLink row={row} subId={subId}>
          {row.brand} {row.model}
        </OfferLink>
        {row.shuckable && (
          <span style={badge} title={row.shuckedEquivalent ?? 'Shuckable enclosure'}>
            shuckable
          </span>
        )}
        {row.lotSize > 1 && (
          <span style={badge} title={`${row.lotSize} drives, ${totalTb} TB total`}>
            lot of {row.lotSize}
          </span>
        )}
        {row.shippingIsCalculated && (
          <span
            style={{ ...badge, borderColor: 'var(--warn)' }}
            title="eBay reports calculated shipping; the real cost depends on your postcode and is not included"
          >
            shipping unknown
          </span>
        )}
      </td>

      <td style={{ ...td, whiteSpace: 'nowrap' }} className="tabular">
        {formatCapacity(row.capacityBytes)}
      </td>

      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        {row.technology ? TECHNOLOGY[row.technology] : '—'}
      </td>

      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        {row.formFactor ? labelFor('formFactor', row.formFactor) : '—'}
      </td>

      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        {row.interface ? labelFor('interface', row.interface) : '—'}
      </td>

      <td style={{ ...td, whiteSpace: 'nowrap' }}>{CONDITION[row.condition]}</td>

      <RiskCell row={row} />

      <td style={{ ...td, whiteSpace: 'nowrap' }} className="tabular">
        {formatDollars(
          (row.priceCents + (query.includeShipping ? row.shippingCents : 0)) / 100,
        )}
      </td>

      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        {count > 1 ? (
          // <details> expands inline with no JavaScript.
          <details>
            <summary style={{ cursor: 'pointer' }}>{count} offers</summary>
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1rem' }}>
              {group.offers.map(({ row: offer, pptCents }) => (
                <li key={offer.offerId} style={{ marginBottom: '0.2rem' }}>
                  <span className="tabular">{ppt(pptCents)}</span>{' '}
                  <OfferLink row={offer} subId={subId}>
                    {MARKETPLACE[offer.marketplace]}
                    {offer.sellerName ? ` · ${offer.sellerName}` : ''}
                  </OfferLink>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <OfferLink row={row} subId={subId}>
            {MARKETPLACE[row.marketplace]}
          </OfferLink>
        )}
      </td>
    </tr>
  );
}

export function DriveTable({
  view,
  query,
  subId = 'home',
}: {
  view: TableView;
  query: Query;
  /** Landing-page slug, so revenue attributes to routes (ticket 4.6). */
  subId?: string;
}) {
  if (view.groups.length === 0) {
    return (
      <p style={{ color: 'var(--fg-muted)', margin: '1rem 0' }}>
        {view.totalOffers === 0
          ? 'No live listings. Offers expire on a 6-hour TTL and are hard-deleted, so an empty table means ingest has not run recently — not that nothing is for sale.'
          : 'No drives match these filters. Try clearing one.'}
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <caption style={caption}>
          {view.groups.length.toLocaleString('en-US')} drives ·{' '}
          {view.matchedOffers.toLocaleString('en-US')} offers
          {view.floorPptCents !== null && (
            <>
              {' '}
              · cheapest <strong>{ppt(view.floorPptCents)}/TB</strong>
            </>
          )}
          {query.includeShipping ? ' · shipping included' : ' · shipping excluded'}
        </caption>
        <thead>
          <tr>
            <th style={th}>$/TB</th>
            <th style={th}>Drive</th>
            <th style={th}>Capacity</th>
            <th style={th}>Technology</th>
            <th style={th}>Form factor</th>
            <th style={th}>Interface</th>
            <th style={th}>Condition</th>
            <th style={th}>Risk</th>
            <th style={th}>Price</th>
            <th style={th}>Source</th>
          </tr>
        </thead>
        <tbody>
          {view.groups.map((group) => (
            <GroupRow key={group.key} group={group} query={query} subId={subId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const table: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: '13px',
};

const caption: React.CSSProperties = {
  captionSide: 'top',
  textAlign: 'left',
  color: 'var(--fg-muted)',
  paddingBottom: '0.5rem',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  padding: '0.35rem 0.6rem 0.35rem 0',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  borderBottom: '1px solid var(--border)',
  padding: '0.35rem 0.6rem 0.35rem 0',
  verticalAlign: 'top',
};

const badge: React.CSSProperties = {
  marginLeft: '0.4rem',
  padding: '0 0.3rem',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  fontSize: '11px',
  color: 'var(--fg-muted)',
  whiteSpace: 'nowrap',
};
