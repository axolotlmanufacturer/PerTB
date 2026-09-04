'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useTransition } from 'react';
import {
  AXES,
  AXIS_KEYS,
  AXIS_LABELS,
  DEFAULT_ADJUSTMENTS,
  labelFor,
  type Axis,
} from '@/lib/taxonomy';
import { DEFAULT_SORT, type Query } from '@/lib/query';
import type { FacetCounts } from '@/lib/table';

/**
 * The facet rail — the only client island of consequence.
 *
 * It is a real <form method="GET">. That matters: with JavaScript disabled the
 * checkboxes still submit and the server still renders the filtered table, so
 * the page is complete and correct without JS (CLAUDE.md §6). The client half
 * only removes the need to press Apply.
 *
 * Counts come from the server and are computed with each axis's own selection
 * skipped, so selecting one interface leaves the other interface counts
 * non-zero and clickable (CLAUDE.md §3.5). Getting that wrong turns these
 * checkbox groups into radio buttons.
 */
export function FacetRail({
  query,
  counts,
  activeCount,
  action = '/',
}: {
  query: Query;
  counts: FacetCounts;
  activeCount: number;
  /** Where the form submits. A landing filters within itself, not back to /. */
  action?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Progressive enhancement: submit on change instead of waiting for Apply.
   * Navigation goes through the router so the server re-renders the table.
   */
  function submitNow(): void {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams(new FormData(form) as never);
    // Drop empties so the URL stays close to canonical.
    for (const [key, value] of [...params]) {
      if (value === '') params.delete(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${action}?${qs}` : action);
    });
  }

  return (
    <form
      ref={formRef}
      method="GET"
      action={action}
      onChange={submitNow}
      className="rail"
      aria-busy={pending}
    >
      <div className="rail__head">
        <span className="rail__title">Filters</span>
        {activeCount > 0 && (
          // Renders a real <a href="/">, so reset works with JavaScript off
          // and does a client transition when it is on.
          <Link href={action} className="rail__reset" data-testid="reset-filters">
            reset ({activeCount})
          </Link>
        )}
      </div>

      {AXES.map((axis) => (
        <fieldset key={axis} className="facet">
          <legend className="facet__legend">{AXIS_LABELS[axis]}</legend>
          {(AXIS_KEYS[axis] as readonly string[]).map((value) => {
            const count = counts[axis][value] ?? 0;
            const checked = (query[axis] as readonly string[]).includes(value);
            return (
              <label
                key={value}
                // Zero-count options stay visible and clickable: they are how
                // a user discovers what widening the filter would show.
                className={`opt${count === 0 && !checked ? ' opt--empty' : ''}`}
              >
                <input
                  type="checkbox"
                  name={axis}
                  value={value}
                  defaultChecked={checked}
                  data-testid={`facet-${axis}-${value}`}
                />
                <span>{labelFor(axis as Axis, value as never)}</span>
                <span
                  className="opt__count tabular"
                  data-testid={`count-${axis}-${value}`}
                >
                  {count}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}

      <fieldset className="facet">
        <legend className="facet__legend">Capacity (TB)</legend>
        <div className="rail__range">
          <input
            type="number"
            name="capMin"
            placeholder="min"
            min={0.12}
            max={40}
            step="any"
            defaultValue={query.capMin ?? ''}
            className="field"
            aria-label="Minimum capacity in terabytes"
          />
          <input
            type="number"
            name="capMax"
            placeholder="max"
            min={0.12}
            max={40}
            step="any"
            defaultValue={query.capMax ?? ''}
            className="field"
            aria-label="Maximum capacity in terabytes"
          />
        </div>
      </fieldset>

      <fieldset className="facet">
        <legend className="facet__legend">Adjustments</legend>

        {/*
          Shipping defaults to ON. Without it, eBay's $0.99-item-plus-$28-
          shipping listings top the table permanently. The hidden field carries
          the "off" value when the box is unchecked, because an unchecked
          checkbox submits nothing at all.
        */}
        <input type="hidden" name="shipping" value="0" />
        <label className="opt">
          <input
            type="checkbox"
            name="shipping"
            value="1"
            defaultChecked={query.includeShipping}
            data-testid="toggle-shipping"
          />
          <span>Include shipping</span>
        </label>

        <input type="hidden" name="hideLots" value="0" />
        <label className="opt">
          <input
            type="checkbox"
            name="hideLots"
            value="1"
            defaultChecked={query.hideLots}
            data-testid="toggle-hide-lots"
          />
          <span>Hide multi-drive lots</span>
        </label>

        <input type="hidden" name="inStock" value="0" />
        <label className="opt">
          <input
            type="checkbox"
            name="inStock"
            value="1"
            defaultChecked={query.inStockOnly}
            data-testid="toggle-in-stock"
          />
          <span>In stock only</span>
        </label>
      </fieldset>

      <fieldset className="facet">
        <legend className="facet__legend">Sort</legend>
        <select
          name="sort"
          defaultValue={query.sort}
          className="field"
          aria-label="Sort order"
        >
          <option value="ppt_asc">$/TB, cheapest first</option>
          <option value="ppt_desc">$/TB, dearest first</option>
          <option value="price_asc">Total price, lowest first</option>
          <option value="capacity_desc">Capacity, largest first</option>
        </select>
      </fieldset>

      {/*
        The no-JS submit. Hidden when scripting is available, because the form
        submits on change — but it is real markup, not a decoration, and the
        page depends on it when JS is off.
      */}
      <noscript>
        <button type="submit" className="btn">
          Apply filters
        </button>
      </noscript>
    </form>
  );
}

export const FACET_DEFAULTS = { ...DEFAULT_ADJUSTMENTS, sort: DEFAULT_SORT };
