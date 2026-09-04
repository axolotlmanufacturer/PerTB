import { z } from 'zod';
import {
  AXES,
  AXIS_KEYS,
  DEFAULT_ADJUSTMENTS,
  type Axis,
  type AxisValues,
  isAxisValue,
} from './taxonomy';

/**
 * URL ⇄ filter state.
 *
 * The axis keys are the URL parameters, verbatim. A shared link is a
 * first-class artefact here: landing routes are built from these, users paste
 * them at each other, and Google indexes the curated ones.
 *
 * Unknown taxonomy keys are DROPPED SILENTLY rather than rejected. A link
 * shared before a taxonomy change must still render a useful table — a 400 on
 * a stale link is a worse outcome than quietly ignoring one dead facet.
 */

export interface Query {
  technology: AxisValues['technology'][];
  formFactor: AxisValues['formFactor'][];
  interface: AxisValues['interface'][];
  condition: AxisValues['condition'][];
  marketplace: AxisValues['marketplace'][];

  /** Capacity range of ONE drive, in decimal TB. */
  capMin: number | null;
  capMax: number | null;

  includeShipping: boolean;
  hideLots: boolean;
  inStockOnly: boolean;

  /** Landing-route filter for the shucking view. null means "don't care". */
  shuckable: boolean | null;

  sort: Sort;

  /** 1-based. Page 1 is canonical and never appears in the URL. */
  page: number;
}

/**
 * Rows rendered per page.
 *
 * Every group used to go into the HTML. At two hundred drives that is fine; a
 * real two-marketplace catalogue is thousands, and document size and LCP
 * degrade linearly with it. Client-side virtualisation would break the property
 * the whole architecture exists for — the table has to be complete in the
 * initial HTML with JavaScript off (CLAUDE.md §6) — so the cap is server-side
 * and paged, with page 1 canonical.
 */
export const PAGE_SIZE = 100;

export const SORTS = ['ppt_asc', 'ppt_desc', 'price_asc', 'capacity_desc'] as const;
export type Sort = (typeof SORTS)[number];
export const DEFAULT_SORT: Sort = 'ppt_asc';

/** URL parameter names for the three boolean adjustments. */
const PARAM = {
  shipping: 'shipping',
  hideLots: 'hideLots',
  inStock: 'inStock',
  shuckable: 'shuckable',
  capMin: 'capMin',
  capMax: 'capMax',
  sort: 'sort',
  page: 'page',
} as const;

/**
 * Capacity bounds mirror normalize.ts's sanity envelope: nothing below 0.12 TB
 * or above 40 TB is ever published, so a filter outside that range can only be
 * a typo or a crafted URL.
 */
const CAP_MIN = 0.12;
const CAP_MAX = 40;

export type SearchParamsInput =
  URLSearchParams | Record<string, string | string[] | undefined>;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function readAll(input: SearchParamsInput, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const v = input[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Accepts both repeated params (`?condition=used&condition=new`) and the
 * comma-separated form (`?condition=used,new`) that the landing routes and
 * hand-edited links use.
 */
function readList(input: SearchParamsInput, key: string): string[] {
  return readAll(input, key)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function readOne(input: SearchParamsInput, key: string): string | null {
  return readAll(input, key)[0] ?? null;
}

/**
 * Tri-state. Absent means "use the default"; `1`/`true`/`yes`/`on` and
 * `0`/`false`/`no`/`off` are all accepted because these URLs get hand-edited.
 */
/**
 * The page number, defaulting to 1 for anything that is not a page number.
 *
 * A crafted `?page=99999` is a valid request for a page past the end; the table
 * renders empty rather than erroring, and the pager links back. What must never
 * happen is a negative or fractional page reaching `slice`.
 */
function readPage(input: SearchParamsInput): number {
  const raw = readOne(input, PARAM.page);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function readBool(input: SearchParamsInput, key: string): boolean | null {
  const raw = readOne(input, key);
  if (raw === null) return null;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return null; // Unparseable: fall back to the default rather than 400.
}

function readCapacity(input: SearchParamsInput, key: string): number | null {
  const raw = readOne(input, key);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < CAP_MIN || n > CAP_MAX) return null;
  return n;
}

/**
 * The zod schema the brief asks for. It describes the *parsed* shape and is
 * what API boundaries validate against; `parseQuery` below is deliberately
 * lenient on the way in, so the schema never sees a value it would reject.
 */
export const querySchema = z.object({
  technology: z.array(z.enum(AXIS_KEYS.technology)),
  formFactor: z.array(z.enum(AXIS_KEYS.formFactor)),
  interface: z.array(z.enum(AXIS_KEYS.interface)),
  condition: z.array(z.enum(AXIS_KEYS.condition)),
  marketplace: z.array(z.enum(AXIS_KEYS.marketplace)),
  capMin: z.number().min(CAP_MIN).max(CAP_MAX).nullable(),
  capMax: z.number().min(CAP_MIN).max(CAP_MAX).nullable(),
  includeShipping: z.boolean(),
  hideLots: z.boolean(),
  inStockOnly: z.boolean(),
  shuckable: z.boolean().nullable(),
  sort: z.enum(SORTS),
  page: z.number().int().min(1),
});

export const EMPTY_QUERY: Query = {
  technology: [],
  formFactor: [],
  interface: [],
  condition: [],
  marketplace: [],
  capMin: null,
  capMax: null,
  includeShipping: DEFAULT_ADJUSTMENTS.includeShipping,
  hideLots: DEFAULT_ADJUSTMENTS.hideLots,
  inStockOnly: DEFAULT_ADJUSTMENTS.inStockOnly,
  shuckable: null,
  sort: DEFAULT_SORT,
  page: 1,
};

export function parseQuery(input: SearchParamsInput = {}): Query {
  const axisValues = {} as { [K in Axis]: AxisValues[K][] };

  for (const axis of AXES) {
    const selected = new Set<string>();
    for (const raw of readList(input, axis)) {
      // Unknown keys are dropped here, silently and on purpose.
      if (isAxisValue(axis, raw)) selected.add(raw);
    }
    // Canonicalised to taxonomy order, matching serialiseQuery. Two links that
    // select the same facets in a different order must produce the same Query,
    // or the ISR cache tag and the canonical link would vary by click path.
    const values = (AXIS_KEYS[axis] as readonly string[]).filter((k) => selected.has(k));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- key-wise assignment
    (axisValues as any)[axis] = values;
  }

  let capMin = readCapacity(input, PARAM.capMin);
  let capMax = readCapacity(input, PARAM.capMax);
  // A reversed range would silently match nothing; swapping is what the user
  // meant and keeps a shared link useful.
  if (capMin !== null && capMax !== null && capMin > capMax) {
    [capMin, capMax] = [capMax, capMin];
  }

  const sortRaw = readOne(input, PARAM.sort);
  const sort: Sort = (SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as Sort)
    : DEFAULT_SORT;

  return {
    ...axisValues,
    capMin,
    capMax,
    includeShipping:
      readBool(input, PARAM.shipping) ?? DEFAULT_ADJUSTMENTS.includeShipping,
    hideLots: readBool(input, PARAM.hideLots) ?? DEFAULT_ADJUSTMENTS.hideLots,
    inStockOnly: readBool(input, PARAM.inStock) ?? DEFAULT_ADJUSTMENTS.inStockOnly,
    shuckable: readBool(input, PARAM.shuckable),
    sort,
    // A junk, zero or negative page is page 1 rather than an error, for the
    // same reason an unknown facet key is dropped: a bad link should still
    // render a useful table.
    page: readPage(input),
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Serialises only what differs from the defaults, so the canonical URL for an
 * unfiltered view is bare. Landing routes depend on this: a curated route must
 * not acquire a tail of default parameters that makes it look like one of the
 * raw filter permutations robots.txt blocks.
 *
 * Axis order follows AXES and values follow taxonomy order, so the same filter
 * state always produces byte-identical output — otherwise the cache tag and
 * the canonical link would vary by click path.
 */
export function serialiseQuery(query: Query): URLSearchParams {
  const params = new URLSearchParams();

  for (const axis of AXES) {
    const selected = query[axis] as readonly string[];
    if (selected.length === 0) continue;
    const ordered = (AXIS_KEYS[axis] as readonly string[]).filter((k) =>
      selected.includes(k),
    );
    params.set(axis, ordered.join(','));
  }

  if (query.capMin !== null) params.set(PARAM.capMin, String(query.capMin));
  if (query.capMax !== null) params.set(PARAM.capMax, String(query.capMax));

  if (query.includeShipping !== DEFAULT_ADJUSTMENTS.includeShipping) {
    params.set(PARAM.shipping, query.includeShipping ? '1' : '0');
  }
  if (query.hideLots !== DEFAULT_ADJUSTMENTS.hideLots) {
    params.set(PARAM.hideLots, query.hideLots ? '1' : '0');
  }
  if (query.inStockOnly !== DEFAULT_ADJUSTMENTS.inStockOnly) {
    params.set(PARAM.inStock, query.inStockOnly ? '1' : '0');
  }
  if (query.shuckable !== null) {
    params.set(PARAM.shuckable, query.shuckable ? '1' : '0');
  }
  if (query.sort !== DEFAULT_SORT) params.set(PARAM.sort, query.sort);
  // Page 1 is the canonical URL and carries no parameter.
  if (query.page > 1) params.set(PARAM.page, String(query.page));

  return params;
}

/** The URL for another page of the same query. */
export function pageHref(basePath: string, query: Query, page: number): string {
  const params = serialiseQuery({ ...query, page });
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** `?a=b&c=d`, or an empty string when nothing differs from the defaults. */
export function queryToSearchString(query: Query): string {
  const s = serialiseQuery(query).toString();
  return s.length > 0 ? `?${s}` : '';
}

/** True when the query would show the unfiltered table. */
export function isDefaultQuery(query: Query): boolean {
  return serialiseQuery(query).toString().length === 0;
}

/** Number of active filters, for the "reset" affordance and active-filter chips. */
export function activeFilterCount(query: Query): number {
  let n = AXES.reduce((acc, axis) => acc + (query[axis] as readonly string[]).length, 0);
  if (query.capMin !== null) n++;
  if (query.capMax !== null) n++;
  if (query.shuckable !== null) n++;
  if (query.includeShipping !== DEFAULT_ADJUSTMENTS.includeShipping) n++;
  if (query.hideLots !== DEFAULT_ADJUSTMENTS.hideLots) n++;
  if (query.inStockOnly !== DEFAULT_ADJUSTMENTS.inStockOnly) n++;
  return n;
}

/** Toggle one axis value, for the facet rail. Returns a new Query. */
export function toggleAxisValue<K extends Axis>(
  query: Query,
  axis: K,
  value: AxisValues[K],
): Query {
  const current = query[axis] as AxisValues[K][];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...query, [axis]: next };
}
