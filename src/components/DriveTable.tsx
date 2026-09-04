import { AFFILIATE_REL } from '@/lib/affiliate';
import { outboundUrl } from '@/lib/outbound';
import { formatCapacity, formatDollars } from '@/lib/pricing';
import type { Query } from '@/lib/query';
import type { DriveRow, OfferGroup, ShuckComparison, TableView } from '@/lib/table';
import { CONDITION, MARKETPLACE, TECHNOLOGY, labelFor } from '@/lib/taxonomy';
import { HistoryCell } from '@/components/Sparkline';

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

/**
 * An axis we do not know.
 *
 * Rendered as a dash rather than an assumed value, and never as a blank cell —
 * an empty cell reads as "not applicable", which is a different claim.
 */
function Unknown({ reason }: { reason?: string }) {
  return (
    <span
      className="spark-cell__none"
      title={reason ?? 'Not resolvable from the listing'}
    >
      —
    </span>
  );
}

/** Used rows must let the buyer see the risk they are taking (§3.7). */
function RiskCell({ row }: { row: DriveRow }) {
  if (row.condition === 'new') return <td />;

  const bits: string[] = [];
  if (row.powerOnHours !== null) {
    bits.push(`${row.powerOnHours.toLocaleString('en-US')} h`);
  }
  if (row.hasWarranty === false) bits.push('no warranty');
  else if (row.hasWarranty === true) bits.push('warranty');
  if (row.returnPolicy) bits.push(row.returnPolicy.toLowerCase());

  return <td className="dt__risk">{bits.length > 0 ? bits.join(' · ') : '—'}</td>;
}

/**
 * Every outbound link is built here, tagged with the sub-id of the route the
 * visitor is on. Rendering `row.url` directly would produce links that work
 * perfectly and earn nothing.
 */
function OfferLink({
  row,
  subId,
  className,
  children,
}: {
  row: DriveRow;
  subId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={outboundUrl(row, subId)}
      target="_blank"
      rel={AFFILIATE_REL}
      className={className}
    >
      {children}
    </a>
  );
}

/**
 * The shucking delta as a chip (ticket 5.4).
 *
 * Signed, and it says which way. An external that costs MORE per terabyte than
 * the bare drive is the interesting case half the time — the received wisdom is
 * that shucking always wins, and this is the column that tells you when it
 * does not.
 */
function ShuckChip({ shuck }: { shuck: ShuckComparison }) {
  const cheaper = shuck.savingPptCents > 0;
  return (
    <span
      className={`chip ${cheaper ? 'chip--good' : 'chip--warn'}`}
      title={`Cheapest bare equivalent at this capacity: ${shuck.bareLabel} at ${ppt(
        shuck.barePptCents,
      )}/TB. Shucking voids the warranty and the drive inside varies by production run.`}
    >
      shuck {cheaper ? '−' : '+'}
      {ppt(Math.abs(shuck.savingPptCents))}/TB
    </span>
  );
}

function GroupRow({
  group,
  query,
  subId,
  shuckColumn,
}: {
  group: OfferGroup;
  query: Query;
  subId: string;
  shuckColumn: boolean;
}) {
  const row = group.cheapest;
  const count = group.offers.length;
  const totalTb = (Number(row.capacityBytes) * row.lotSize) / 1e12;
  const detailHref = `/drive/${row.productId}?condition=${row.condition}`;

  // The badge states the window it actually observed. "Cheapest in 90 days" on
  // eleven days of data is a false sentence wrapped around correct arithmetic,
  // which is the failure mode §1.1 exists to prevent.
  const history = group.history;
  const cheapestInDays = history?.cheapestInDays ?? null;

  return (
    <tr>
      <td className="num">
        <span className="ppt">{ppt(group.cheapestPptCents)}</span>
        <span className="ppt__unit">/TB</span>
        {/*
          Terse on purpose, and inline rather than on a second line: a badge
          that pushes the row to two lines costs half the rows on screen. The
          full sentence lives in the title, and the number is the window
          actually observed — never the 90 the window was searched over.
        */}
        {history !== null && cheapestInDays !== null && (
          <span
            className="chip chip--good"
            title={`Cheapest in the ${cheapestInDays} days observed. It was ${ppt(
              history.highPptCents,
            )}/TB at its highest in that window.`}
          >
            {cheapestInDays}d low
          </span>
        )}
      </td>

      <td>
        <OfferLink row={row} subId={subId} className="dt__drive">
          {row.brand} {row.model}
        </OfferLink>
        {row.shuckable && !shuckColumn && group.shuck && (
          <ShuckChip shuck={group.shuck} />
        )}
        {row.shuckable && !group.shuck && (
          <span className="chip" title={row.shuckedEquivalent ?? 'Shuckable enclosure'}>
            shuckable
          </span>
        )}
        {row.lotSize > 1 && (
          <span className="chip" title={`${row.lotSize} drives, ${totalTb} TB total`}>
            lot of {row.lotSize}
          </span>
        )}
        {row.shippingIsCalculated && (
          <span
            className="chip chip--warn"
            title="eBay reports calculated shipping; the real cost depends on your postcode and is not included"
          >
            shipping unknown
          </span>
        )}
      </td>

      {shuckColumn && (
        <td className="num">
          {group.shuck ? (
            <>
              <span
                className={group.shuck.savingPptCents > 0 ? 'delta--down' : 'delta--up'}
              >
                {group.shuck.savingPptCents > 0 ? '−' : '+'}
                {ppt(Math.abs(group.shuck.savingPptCents))}
              </span>
              <div className="spark-cell__delta" title={group.shuck.bareLabel}>
                vs {ppt(group.shuck.barePptCents)}
              </div>
            </>
          ) : (
            <span
              className="spark-cell__none"
              title="No bare drive of this capacity is live right now"
            >
              —
            </span>
          )}
        </td>
      )}

      <td>
        <HistoryCell history={group.history} href={detailHref} />
      </td>

      <td className="num">{formatCapacity(row.capacityBytes)}</td>

      <td className="nowrap">
        {row.technology ? (
          TECHNOLOGY[row.technology]
        ) : (
          // An honest blank, not a guess. For a sealed enclosure the drive
          // inside is not disclosed and varies by production run, so this is
          // the true value (CLAUDE.md §3.3, the unknowable-axis clause).
          <Unknown
            reason={
              row.shuckable
                ? 'Not disclosed: the drive inside a sealed enclosure varies by production run'
                : undefined
            }
          />
        )}
      </td>

      <td className="nowrap">
        {row.formFactor ? labelFor('formFactor', row.formFactor) : <Unknown />}
      </td>

      <td className="nowrap">
        {row.interface ? labelFor('interface', row.interface) : <Unknown />}
      </td>

      <td className="nowrap">{CONDITION[row.condition]}</td>

      <RiskCell row={row} />

      <td className="num">
        {formatDollars(
          (row.priceCents + (query.includeShipping ? row.shippingCents : 0)) / 100,
        )}
      </td>

      <td className="nowrap">
        {count > 1 ? (
          // <details> expands inline with no JavaScript.
          <details>
            <summary className="dt__more">{count} offers</summary>
            <ul className="dt__offers">
              {group.offers.map(({ row: offer, pptCents }) => (
                <li key={offer.offerId}>
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
  shuckColumn = false,
}: {
  view: TableView;
  query: Query;
  /** Landing-page slug, so revenue attributes to routes (ticket 4.6). */
  subId?: string;
  /** The shucking view gets the external-vs-bare delta as its own column. */
  shuckColumn?: boolean;
}) {
  if (view.groups.length === 0) {
    return (
      <p className="dt__empty">
        {view.totalOffers === 0
          ? 'No live listings. Offers expire on a 6-hour TTL and are hard-deleted, so an empty table means ingest has not run recently — not that nothing is for sale.'
          : 'No drives match these filters. Try clearing one.'}
      </p>
    );
  }

  return (
    <div className="table-scroll">
      <table className="dt">
        <caption className="dt__caption">
          {/* The selection, not the page. A caption that counted only the
              visible rows would make the floor below it look wrong. */}
          {view.totalGroups.toLocaleString('en-US')} drives ·{' '}
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
            <th className="num">$/TB</th>
            <th>Drive</th>
            {shuckColumn && (
              <th
                className="num"
                title="Versus the cheapest bare drive of the same capacity"
              >
                vs bare
              </th>
            )}
            <th>90 days</th>
            <th className="num">Capacity</th>
            <th>Technology</th>
            <th>Form factor</th>
            <th>Interface</th>
            <th>Condition</th>
            <th>Risk</th>
            <th className="num">Price</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {view.groups.map((group) => (
            <GroupRow
              key={group.key}
              group={group}
              query={query}
              subId={subId}
              shuckColumn={shuckColumn}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
