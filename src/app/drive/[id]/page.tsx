import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PriceChart } from '@/components/PriceChart';
import { Breadcrumb, type Crumb } from '@/components/Seo';
import { SiteFooter } from '@/components/SiteFooter';
import { AFFILIATE_REL } from '@/lib/affiliate';
import { MIN_BADGE_DAYS } from '@/lib/history';
import { loadDriveRows, loadPriceHistory } from '@/lib/offers';
import { outboundUrl } from '@/lib/outbound';
import { formatCapacity, formatDollars } from '@/lib/pricing';
import { EMPTY_QUERY } from '@/lib/query';
import { SITE_NAME } from '@/lib/site';
import { buildTable, type OfferGroup } from '@/lib/table';
import { CONDITION, MARKETPLACE, TECHNOLOGY, labelFor } from '@/lib/taxonomy';

/**
 * Per-product price history (ticket 5.3).
 *
 * Deliberately NOT indexed. The page is a snapshot of listings that expire
 * within hours, its URL is a database id, and a product with no live offers is
 * a 404 by the same rule that empties the table — every read path filters on
 * `expiresAt > now()`. Letting Google index a few thousand of those would fill
 * the index with soft-404s and drag down the curated routes that are the whole
 * point of Phase 4. It is linked from the table for people, and `follow` keeps
 * the outbound links doing their job.
 */

export const revalidate = 900;

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

const SUB_ID = 'drive';

function ppt(cents: number): string {
  return formatDollars(cents / 100);
}

export default async function DrivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const requested = (await searchParams).condition;

  const now = new Date();
  const rows = await loadDriveRows(now, { productId: id });

  // No live, publishable offer means no page. The alternative — rendering the
  // specification of something nobody can currently buy — is a thin page with
  // no outbound link on it.
  if (rows.length === 0) notFound();

  const history = await loadPriceHistory(now, { productId: id });
  const view = buildTable(rows, EMPTY_QUERY, { history, now: now.getTime() });

  const product = rows[0];
  if (!product) notFound();

  const name = `${product.brand} ${product.model}`;
  const title = `${name} ${formatCapacity(product.capacityBytes)}`;

  // The row the visitor clicked, when they came from the table.
  const preferred =
    typeof requested === 'string'
      ? view.groups.find((g) => g.cheapest.condition === requested)
      : undefined;
  const groups = preferred
    ? [preferred, ...view.groups.filter((g) => g !== preferred)]
    : view.groups;

  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: '/' },
    { name: title, path: `/drive/${id}` },
  ];

  return (
    <main className="shell">
      <Breadcrumb crumbs={crumbs} />

      <header className="masthead">
        <h1 className="masthead__title">{title}</h1>
        <Link href="/" className="masthead__home">
          All drives · {SITE_NAME}
        </Link>
      </header>

      <ul className="detail__specs">
        <Spec label="Capacity" value={formatCapacity(product.capacityBytes)} />
        <Spec
          label="Technology"
          value={product.technology ? TECHNOLOGY[product.technology] : 'unresolved'}
        />
        <Spec
          label="Form factor"
          value={
            product.formFactor ? labelFor('formFactor', product.formFactor) : 'unresolved'
          }
        />
        <Spec
          label="Interface"
          value={
            product.interface ? labelFor('interface', product.interface) : 'unresolved'
          }
        />
        {product.rpm !== null && <Spec label="Spindle" value={`${product.rpm} RPM`} />}
        {product.shuckable && (
          <Spec label="Shuckable" value={product.shuckedEquivalent ?? 'yes'} />
        )}
      </ul>

      {groups.map((group) => (
        <ConditionPanel key={group.key} group={group} />
      ))}

      <SiteFooter />
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <li className="detail__spec">
      {label} <b>{value}</b>
    </li>
  );
}

/**
 * One panel per condition. Never merged: new and used of the same drive are
 * different products to a buyer (CLAUDE.md §3.6), and a single chart spanning
 * both would show a price move that is really a change of which market was
 * cheapest that week.
 */
function ConditionPanel({ group }: { group: OfferGroup }) {
  const history = group.history;

  return (
    <section className="panel">
      <h2 className="panel__title">
        {CONDITION[group.cheapest.condition]} · {group.offers.length}{' '}
        {group.offers.length === 1 ? 'listing' : 'listings'}
      </h2>

      {history ? (
        <PriceChart history={history} />
      ) : (
        <p className="panel__note">
          No price movement recorded yet. An observation is written only when a price
          actually changes, so a flat listing produces a single point until it moves.
        </p>
      )}

      <div className="stat-row">
        <div>
          <span className="stat__label">Now</span>
          <span className="stat__value">{ppt(group.cheapestPptCents)}/TB</span>
        </div>
        {history && (
          <>
            <div>
              <span className="stat__label">Low, {history.depthDays}d</span>
              <span className="stat__value">{ppt(history.lowPptCents)}/TB</span>
            </div>
            <div>
              <span className="stat__label">High, {history.depthDays}d</span>
              <span className="stat__value">{ppt(history.highPptCents)}/TB</span>
            </div>
          </>
        )}
        <div>
          <span className="stat__label">Cheapest listing</span>
          <span className="stat__value">
            {formatDollars(
              (group.cheapest.priceCents + group.cheapest.shippingCents) / 100,
            )}
          </span>
        </div>
      </div>

      {history && history.depthDays < MIN_BADGE_DAYS && (
        <p className="panel__note">
          Only {history.depthDays} {history.depthDays === 1 ? 'day' : 'days'} of history
          so far — too short to say whether this price is good. History reaches back as
          far as the listing has been continuously live.
        </p>
      )}

      <ul className="dt__offers" style={{ marginTop: '0.75rem' }}>
        {group.offers.map(({ row, pptCents }) => (
          <li key={row.offerId}>
            <span className="tabular">{ppt(pptCents)}/TB</span>{' '}
            <a href={outboundUrl(row, SUB_ID)} target="_blank" rel={AFFILIATE_REL}>
              {MARKETPLACE[row.marketplace]}
              {row.sellerName ? ` · ${row.sellerName}` : ''}
            </a>{' '}
            <span className="spark-cell__delta">
              {formatDollars((row.priceCents + row.shippingCents) / 100)}
              {row.lotSize > 1 ? ` · lot of ${row.lotSize}` : ''}
              {row.powerOnHours !== null
                ? ` · ${row.powerOnHours.toLocaleString('en-US')} h`
                : ''}
              {row.hasWarranty === false ? ' · no warranty' : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
