import type { Metadata } from 'next';
import { formatCapacity, formatDollars } from '@/lib/pricing';
import {
  loadQuarantine,
  proposeDictionaryEntry,
  quarantineCounts,
  type QuarantineItem,
} from '@/lib/quarantine';
import { CONFIDENCE_THRESHOLD } from '@/lib/normalize';
import { AXIS_KEYS, FORM_FACTOR, INTERFACE, TECHNOLOGY } from '@/lib/taxonomy';
import { correctProduct, promoteProduct, rejectProduct } from './actions';

/**
 * /admin/quarantine — ticket 7.2.
 *
 * The listings the confidence rule withheld, with what the parser read next to
 * what the seller actually wrote. A review UI that shows only the parsed fields
 * cannot tell you whether the parser was wrong, which is the one question being
 * asked here.
 *
 * Gated by the Basic-auth middleware on /admin. Never cached, never indexed.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Quarantine',
  robots: { index: false, follow: false },
};

function Axis({
  label,
  parsed,
  reparsed,
}: {
  label: string;
  parsed: string | null;
  reparsed?: string | null;
}) {
  const drifted = reparsed !== undefined && reparsed !== parsed;
  return (
    <li className="detail__spec">
      {label} <b>{parsed ?? '—'}</b>
      {drifted && (
        <>
          {' '}
          <span
            className="chip chip--accent"
            title="The dictionary has changed since this was ingested"
          >
            now reads {reparsed ?? '—'}
          </span>
        </>
      )}
    </li>
  );
}

function Item({ item }: { item: QuarantineItem }) {
  const title = item.offers.find((o) => o.rawTitle)?.rawTitle ?? null;

  return (
    <section className="panel">
      <h2 className="panel__title">
        {item.brand} {item.model} · {formatCapacity(item.capacityBytes)} · confidence{' '}
        {item.parsed.confidence.toFixed(2)}
      </h2>

      {/* The raw title first. It is the evidence; everything else is a reading
          of it, and a reviewer who starts from the parse will confirm it. */}
      <p className="quarantine__raw">
        {title ?? <em>No raw title stored for this row.</em>}
      </p>

      <ul className="detail__specs">
        <Axis
          label="Technology"
          parsed={item.parsed.technology ? TECHNOLOGY[item.parsed.technology] : null}
          reparsed={
            item.reparsed
              ? item.reparsed.technology
                ? TECHNOLOGY[item.reparsed.technology]
                : null
              : undefined
          }
        />
        <Axis
          label="Form factor"
          parsed={item.parsed.formFactor ? FORM_FACTOR[item.parsed.formFactor] : null}
          reparsed={
            item.reparsed
              ? item.reparsed.formFactor
                ? FORM_FACTOR[item.reparsed.formFactor]
                : null
              : undefined
          }
        />
        <Axis
          label="Interface"
          parsed={item.parsed.interface ? INTERFACE[item.parsed.interface] : null}
          reparsed={
            item.reparsed
              ? item.reparsed.interface
                ? INTERFACE[item.reparsed.interface]
                : null
              : undefined
          }
        />
        <li className="detail__spec">
          Dictionary <b>{item.parsed.dictionaryId ?? 'no match'}</b>
        </li>
        {item.reparsed && item.reparsed.confidence !== item.parsed.confidence && (
          <li className="detail__spec">
            Re-parsed confidence <b>{item.reparsed.confidence.toFixed(2)}</b>
          </li>
        )}
      </ul>

      <ul className="dt__offers">
        {item.offers.map((offer) => (
          <li key={offer.offerId}>
            <span className="tabular">{formatDollars(offer.priceCents / 100)}</span>{' '}
            <a href={offer.url} target="_blank" rel="noopener noreferrer">
              {offer.marketplace} · {offer.externalId}
            </a>{' '}
            <span className="spark-cell__delta">{offer.condition}</span>
          </li>
        ))}
      </ul>

      <div className="quarantine__actions">
        <form action={promoteProduct}>
          <input type="hidden" name="productId" value={item.productId} />
          <button type="submit" className="btn">
            Publish as parsed
          </button>
        </form>

        <form action={correctProduct} className="quarantine__correct">
          <input type="hidden" name="productId" value={item.productId} />
          <select
            name="technology"
            defaultValue={item.parsed.technology ?? ''}
            className="field"
            aria-label="Technology"
          >
            <option value="">technology — unknown</option>
            {AXIS_KEYS.technology.map((key) => (
              <option key={key} value={key}>
                {TECHNOLOGY[key]}
              </option>
            ))}
          </select>
          <select
            name="formFactor"
            defaultValue={item.parsed.formFactor ?? ''}
            className="field"
            aria-label="Form factor"
          >
            <option value="">form factor — unknown</option>
            {AXIS_KEYS.formFactor.map((key) => (
              <option key={key} value={key}>
                {FORM_FACTOR[key]}
              </option>
            ))}
          </select>
          <select
            name="interface"
            defaultValue={item.parsed.interface ?? ''}
            className="field"
            aria-label="Interface"
          >
            <option value="">interface — unknown</option>
            {AXIS_KEYS.interface.map((key) => (
              <option key={key} value={key}>
                {INTERFACE[key]}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="note"
            placeholder="note (what did you check?)"
            className="field"
            aria-label="Review note"
          />
          <button type="submit" className="btn btn--primary">
            Correct and publish
          </button>
        </form>

        <form action={rejectProduct}>
          <input type="hidden" name="productId" value={item.productId} />
          <input
            type="text"
            name="note"
            placeholder="why"
            className="field"
            aria-label="Rejection reason"
          />
          <button type="submit" className="btn">
            Reject
          </button>
        </form>
      </div>

      {/*
        The durable half. Correcting the product fixes one row; the dictionary
        entry fixes the family, and it arrives as a diff someone can review
        rather than a database write nobody sees.
      */}
      <details>
        <summary className="dt__more">Proposed spec-dictionary.json entry</summary>
        <pre>
          <code>
            {proposeDictionaryEntry({
              brand: item.brand,
              model: item.model,
              technology: item.parsed.technology,
              formFactor: item.parsed.formFactor,
              interface: item.parsed.interface,
            })}
          </code>
        </pre>
      </details>
    </section>
  );
}

export default async function QuarantinePage() {
  const [items, counts] = await Promise.all([loadQuarantine(), quarantineCounts()]);

  return (
    <main className="shell">
      <header className="masthead">
        <h1 className="masthead__title">Quarantine</h1>
        <span className="masthead__home">
          {counts.pending} pending · {counts.reviewed} reviewed · {counts.rejected}{' '}
          rejected
        </span>
      </header>

      <p className="intro">
        Listings held back because normalisation could not resolve every axis above{' '}
        {CONFIDENCE_THRESHOLD}. They are stored but never published. The raw title is
        shown first on purpose — it is the evidence, and the parse is a reading of it. Fix
        the dictionary as well as the row: a corrected product helps one drive, a
        dictionary entry helps every future listing of that family.
      </p>

      {items.length === 0 ? (
        <p className="dt__empty">
          Nothing in the queue. Either normalisation is resolving everything it sees, or
          ingest has not run.
        </p>
      ) : (
        items.map((item) => <Item key={item.productId} item={item} />)
      )}
    </main>
  );
}
