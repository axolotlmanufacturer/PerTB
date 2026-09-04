import specDictionary from './spec-dictionary.json';
import type { FormFactor, Interface, Technology } from './taxonomy';
import { isFormFactor, isInterface, isTechnology } from './taxonomy';

/**
 * The correctness layer.
 *
 * Neither marketplace gives us a trustworthy capacity, form factor or
 * interface: Amazon's ItemInfo attributes are seller-supplied and frequently
 * absent, and eBay's item aspects are worse. Everything rests on parsing the
 * title, so everything here is written to fail closed.
 *
 * Base implementation is the brief's Appendix A, kept intact. The extensions
 * are: dictionary lookup ahead of the regexes, warranty and return-policy
 * parsing, non-product rejection, and shuckable resolution.
 *
 * See CLAUDE.md §3.3.
 */

export const CONFIDENCE_THRESHOLD = 0.6;

const TB = 1_000_000_000_000n;
const GB = 1_000_000_000n;

export interface Normalised {
  capacityBytes: bigint | null;
  lotSize: number;
  technology: Technology | null;
  formFactor: FormFactor | null;
  interface: Interface | null;
  rpm: number | null;
  powerOnHours: number | null;
  confidence: number;

  // Extensions beyond Appendix A.
  brand: string | null;
  family: string | null;
  warrantyYears: number | null;
  hasWarranty: boolean | null;
  returnPolicy: string | null;
  shuckable: boolean;
  shuckedEquivalent: string | null;
  dictionaryId: string | null;
  rejected: boolean;
  rejectionReason: string | null;
}

/** A classification plus how much we trust it. */
interface Signal<T> {
  value: T | null;
  conf: number;
}

const none = <T>(): Signal<T> => ({ value: null, conf: 0 });

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export function parseCapacity(title: string): bigint | null {
  // Unit must be adjacent to the number, or "7200 RPM" and "256MB cache" match.
  const m = title.match(/(\d+(?:[.,]\d+)?)\s*(TB|TERABYTE|GB|GIGABYTE)\b/i);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = m[2].toUpperCase();
  const bytes = unit.startsWith('T')
    ? BigInt(Math.round(value * 1000)) * GB
    : BigInt(Math.round(value)) * GB;
  // Below 120GB is legacy junk with unreliable pricing; above 40TB does not
  // exist as a single retail drive, so a match that large is a lot total or a
  // cache figure that slipped through.
  if (bytes < 120n * GB || bytes > 40n * TB) return null;
  return bytes;
}

// ---------------------------------------------------------------------------
// Lot size — the highest-value rule in the file
// ---------------------------------------------------------------------------

/**
 * Order matters, and it is not Appendix A's order.
 *
 * The suffix form ("4-pack", "5 pack") must be tried BEFORE the prefix form
 * ("pack of 4"), because on a title like `WD Red Plus 4TB 4-pack 3.5" SATA`
 * the prefix pattern reads "pack 3.5" and returns a lot size of 3 — dividing
 * the price by three drives that do not exist. The trailing guard on the
 * prefix form stops it swallowing a dimension for the same reason.
 */
const LOT_PATTERNS: RegExp[] = [
  /\blot\s+of\s+(\d{1,3})\b/i,
  /\b(\d{1,3})\s*[x×]\s*\d+(?:\.\d+)?\s*(?:TB|GB)\b/i,
  /\b(\d{1,3})\s*[-\s]?(?:pack|pk|drives|units|pcs)\b/i,
  /\b(?:pack|bundle|qty|quantity)\s*(?:of)?\s*[:\-]?\s*(\d{1,3})\b(?!\s*["']|\.\d)/i,
];

export function parseLotSize(title: string): number {
  for (const re of LOT_PATTERNS) {
    const m = title.match(re);
    if (m?.[1] !== undefined) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 100) return n;
    }
  }
  return 1;
}

// ---------------------------------------------------------------------------
// Technology
// ---------------------------------------------------------------------------

const CMR_FAMILIES =
  /\b(ironwolf|exos|ultrastar|red\s*pro|red\s*plus|gold|n300|mg\d{2}|mn\d{2}|skyhawk|purple\s*pro|constellation|he\d{1,2})\b/i;
const SMR_FAMILIES =
  /\b(barracuda(?!\s*pro)|wd\s*blue|my\s*passport|elements\s*portable|one\s*touch|archive\s*hdd)\b/i;
const QLC_FAMILIES = /\b(p3\s*plus|p3\b|qlc|670p|660p|mp44(?!\s*l)|x9\s*pro|bx500)\b/i;
const MLC_FAMILIES = /\b(mlc|970\s*pro|860\s*pro|mx300)\b/i;

export function classifyTechnology(title: string): Signal<Technology> {
  const t = title;
  if (/\b(sshd|hybrid\s+drive)\b/i.test(t)) return { value: 'sshd', conf: 0.9 };

  if (/\b(ssd|nvme|m\.?2|solid[\s-]?state|u\.[23])\b/i.test(t)) {
    if (MLC_FAMILIES.test(t)) return { value: 'ssd_mlc', conf: 0.85 };
    if (QLC_FAMILIES.test(t)) return { value: 'ssd_qlc', conf: 0.8 };
    if (/\btlc\b/i.test(t)) return { value: 'ssd_tlc', conf: 0.9 };
    return { value: 'ssd_tlc', conf: 0.65 }; // TLC is the overwhelming default
  }
  if (/\b(hdd|hard\s*(disk\s*)?drive|rpm|cmr|smr)\b/i.test(t)) {
    if (/\bcmr\b/i.test(t) || CMR_FAMILIES.test(t))
      return { value: 'hdd_cmr', conf: 0.85 };
    if (/\bsmr\b/i.test(t) || SMR_FAMILIES.test(t))
      return { value: 'hdd_smr', conf: 0.8 };
    return { value: 'hdd_cmr', conf: 0.4 }; // below threshold on its own
  }
  return none();
}

/**
 * A CMR/SMR or NAND-type token stated outright in the title.
 *
 * This outranks the dictionary: the curated table exists because the recording
 * technology is *usually* unstated, but when a seller does state it, that is
 * direct evidence about the specific unit rather than an inference from the
 * family name.
 */
function explicitTechnology(text: string): Signal<Technology> {
  const isHddContext = /\b(hdd|hard\s*(disk\s*)?drive|rpm|sata|sas)\b/i.test(text);
  if (/\bsshd\b/i.test(text)) return { value: 'sshd', conf: 0.9 };
  if (/\bcmr\b/i.test(text) && isHddContext) return { value: 'hdd_cmr', conf: 0.9 };
  if (/\bsmr\b/i.test(text) && isHddContext) return { value: 'hdd_smr', conf: 0.9 };
  if (/\bqlc\b/i.test(text)) return { value: 'ssd_qlc', conf: 0.9 };
  if (/\bmlc\b/i.test(text)) return { value: 'ssd_mlc', conf: 0.9 };
  if (/\btlc\b/i.test(text)) return { value: 'ssd_tlc', conf: 0.9 };
  return none();
}

// ---------------------------------------------------------------------------
// Form factor
// ---------------------------------------------------------------------------

export function classifyFormFactor(title: string): Signal<FormFactor> {
  const t = title;
  if (/\b2230\b/i.test(t)) return { value: 'm2_2230', conf: 0.85 };
  if (/\bm\.?2\b/i.test(t)) return { value: 'm2_2280', conf: 0.75 };
  if (/\bu\.?[23]\b|\b2\.5"?\s*nvme\b/i.test(t)) return { value: 'u2', conf: 0.85 };

  if (
    /\b(external|portable|desktop\s+drive|my\s*passport|elements|easystore|expansion|one\s*touch|t[579]\b|extreme\s*(pro)?)\b/i.test(
      t,
    )
  ) {
    const portable =
      /\b(portable|passport|one\s*touch|t[579]\b|extreme|bus[\s-]powered|x9|x10)\b/i.test(
        t,
      );
    return { value: portable ? 'ext_portable' : 'ext_desktop', conf: 0.75 };
  }

  if (/\b3\.5"?[\s-]?(inch)?\b/i.test(t)) return { value: '3.5', conf: 0.85 };
  if (/\b2\.5"?[\s-]?(inch)?\b/i.test(t)) return { value: '2.5', conf: 0.85 };

  // Last resort: no 2.5" SATA drive ships above 8TB.
  const cap = parseCapacity(t);
  if (cap && cap >= 8n * TB) return { value: '3.5', conf: 0.6 };
  return none();
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export function classifyInterface(title: string): Signal<Interface> {
  const t = title;
  if (/\bpcie\s*(gen\s*)?5|\bgen\s*5\b/i.test(t)) return { value: 'pcie5', conf: 0.85 };
  if (/\bpcie\s*(gen\s*)?4|\bgen\s*4\b/i.test(t)) return { value: 'pcie4', conf: 0.85 };
  if (/\bpcie\s*(gen\s*)?3|\bgen\s*3\b/i.test(t)) return { value: 'pcie3', conf: 0.85 };
  if (/\bsas\b/i.test(t)) return { value: 'sas12', conf: 0.85 };
  if (/\busb\s*3\.2\s*gen\s*2x2|\b20\s*gbps\b/i.test(t))
    return { value: 'usb_g2x2', conf: 0.8 };
  if (/\busb\s*3\.[12]\s*gen\s*2\b|\b10\s*gbps\b/i.test(t))
    return { value: 'usb_g2', conf: 0.8 };
  if (/\busb\b/i.test(t)) return { value: 'usb_g1', conf: 0.6 };
  if (/\bsata\b|\b6\s*gb\/s\b/i.test(t)) return { value: 'sata3', conf: 0.85 };
  if (/\bnvme\b/i.test(t)) return { value: 'pcie4', conf: 0.45 };
  return none();
}

// ---------------------------------------------------------------------------
// Other scalars
// ---------------------------------------------------------------------------

export function parsePowerOnHours(text: string): number | null {
  const patterns = [
    // "24,500 hours" — the number-first form.
    /([\d,]{2,7})\s*(?:power[\s-]?on\s*)?(?:hours|hrs|poh)\b/i,
    // Label-first, which Appendix A misses entirely. Sellers write it every
    // way there is — "Power on hours: 41200", "POH 33450", "power on hours
    // 4,200", "power on hours range 28000-31000" — so allow a short run of
    // non-digits between the label and the number rather than enumerating
    // separators. On a range this takes the low end.
    /(?:power[\s-]?on\s*(?:hours|hrs)|poh)\b[^\d]{0,12}([\d,]{2,7})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] === undefined) continue;
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n > 0 && n < 200_000) return n;
  }
  return null;
}

export function parseRpm(title: string): number | null {
  const m = title.match(/\b(5400|5900|7200|10000|10K|15000|15K)\s*rpm\b/i);
  if (m?.[1] === undefined) return null;
  const raw = m[1].toUpperCase();
  return raw === '10K' ? 10000 : raw === '15K' ? 15000 : parseInt(raw, 10);
}

/**
 * Warranty presence. `null` means the listing did not say, which is different
 * from saying there is none — the table must not render "no warranty" on a
 * drive whose seller simply stayed quiet (CLAUDE.md §3.7).
 */
export function parseHasWarranty(text: string): boolean | null {
  // Negatives first: "no warranty" contains "warranty".
  if (
    /\b(no|without|zero)\s+warranty\b|\bwarranty\s*[:\-]?\s*(none|no|expired|void)\b|\bout\s+of\s+warranty\b|\bsold\s+as[\s-]is\b|\bas[\s-]is\b|\bno\s+returns?\s+no\s+warranty\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /\b(\d+)[\s-]*(year|yr)s?\s+warranty\b|\bwarranty\s+(included|remaining|valid|until)\b|\bunder\s+warranty\b|\bmanufacturer'?s?\s+warranty\b|\bwarranty\s*[:\-]?\s*yes\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return null;
}

export function parseWarrantyYears(text: string): number | null {
  const m = text.match(/\b(\d{1,2})[\s-]*(?:year|yr)s?\s+warranty\b/i);
  if (m?.[1] === undefined) return null;
  const n = parseInt(m[1], 10);
  return n > 0 && n <= 10 ? n : null;
}

/**
 * Seller return policy, as a short display string. Buyers of datacentre pulls
 * are making an explicit risk trade and the table has to let them see it.
 */
export function parseReturnPolicy(text: string): string | null {
  if (
    /\b(no\s+returns?|returns?\s+not\s+accepted|final\s+sale|all\s+sales\s+final)\b/i.test(
      text,
    )
  ) {
    return 'No returns';
  }
  const days = text.match(
    /\b(\d{1,3})[\s-]*day[\s-]*(?:money[\s-]*back|returns?|return\s+policy)\b/i,
  );
  if (days?.[1] !== undefined) return `${parseInt(days[1], 10)}-day returns`;
  if (/\breturns?\s+accepted\b/i.test(text)) return 'Returns accepted';
  return null;
}

// ---------------------------------------------------------------------------
// Non-product rejection
// ---------------------------------------------------------------------------

/**
 * Accessories that show up in the same categories and would otherwise be
 * ranked on a capacity parsed out of a compatibility blurb ("fits 4TB
 * drives"). The eBay category filter catches most of these; this is the
 * backstop for the ones it does not.
 */
const NON_PRODUCT =
  /\b(enclosure|caddy|caddies|docking\s*station|dock\b|cable|adapter|adaptor|bracket|mounting|mount\b|sled|tray|screws?|rails?|converter|riser|backplane|expander|controller\s*card|hba\b|raid\s*card|power\s*supply|splitter)\b/i;

/*
 * "heatsink" and "cooler" are deliberately NOT rejection terms. "SSD with
 * Heatsink" and "Graphene Heatsink" are how a large share of Gen4/Gen5 M.2
 * drives are actually listed, and rejecting on the word threw away real
 * drives — the golden corpus caught three. A bare heatsink accessory has no
 * parseable capacity and fails the capacity check instead.
 */

/** Media the catalogue deliberately excludes — they dilute the $/TB framing. */
const OUT_OF_CATALOGUE =
  /\b(sd\s*card|micro\s*sd|microsd|sdxc|sdhc|compact\s*flash|cfexpress|usb\s*(flash\s*)?(drive|stick)|thumb\s*drive|flash\s*drive|memory\s*card|lto[\s-]?\d|tape\s*(drive|cartridge)|dvd|blu[\s-]?ray|cd-r|floppy|ddr[2-5]|dimm|so-dimm|rdimm)\b/i;

export function classifyRejection(title: string): string | null {
  if (NON_PRODUCT.test(title)) return 'accessory';
  if (OUT_OF_CATALOGUE.test(title)) return 'out-of-catalogue media';
  return null;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

export interface SpecEntry {
  id: string;
  brand: string;
  family: string;
  match: string[];
  exclude?: string[];
  technology?: string;
  formFactor?: string;
  interface?: string;
  rpm?: number;
  warrantyYears?: number;
  shuckable?: boolean;
  shuckedEquivalent?: string;
  confidence: number;
  technologyConfidence?: number;
  formFactorConfidence?: number;
  interfaceConfidence?: number;
  /**
   * Axes this family can NEVER resolve from a listing, however it is written.
   *
   * Not "we did not manage to read it" — "there is nothing to read". The only
   * members today are the recording technologies of sealed external enclosures,
   * where the manufacturer does not disclose the drive inside and it varies by
   * production run. See the note on `unknowableAxes` in `normalise`.
   */
  unknowable?: string[];
  note?: string;
}

interface CompiledEntry {
  entry: SpecEntry;
  patterns: { re: RegExp; length: number }[];
  excludes: RegExp[];
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Word boundary at the START only.
 *
 * A trailing \b would break real part numbers: "mg08" must match inside
 * "MG08ACA16TE". Anchoring the front is what stops "crucial p3" matching
 * "P300" and "t500" matching "ST500LM030".
 */
const compile = (needle: string): RegExp => new RegExp(`\\b${escapeRe(needle)}`, 'i');

const COMPILED: CompiledEntry[] = (specDictionary.families as SpecEntry[]).map(
  (entry) => ({
    entry,
    patterns: entry.match.map((m) => ({ re: compile(m), length: m.length })),
    excludes: (entry.exclude ?? []).map(compile),
  }),
);

export interface DictionaryHit {
  entry: SpecEntry;
  matchedLength: number;
}

/**
 * Longest match wins, so "ironwolf pro" beats "ironwolf" and a model number
 * beats a family name. `exclude` handles the cases where the more specific
 * family has the *shorter* name — "Crucial P3 Plus" would otherwise match
 * "crucial p3".
 */
export function lookupDictionary(title: string): DictionaryHit | null {
  let best: DictionaryHit | null = null;

  for (const { entry, patterns, excludes } of COMPILED) {
    if (excludes.some((re) => re.test(title))) continue;

    let longest = 0;
    for (const { re, length } of patterns) {
      if (length > longest && re.test(title)) longest = length;
    }
    if (longest === 0) continue;

    if (!best || longest > best.matchedLength) {
      best = { entry, matchedLength: longest };
    }
  }

  return best;
}

function dictSignal<T>(
  raw: string | undefined,
  guard: (v: unknown) => v is T,
  conf: number | undefined,
  base: number,
): Signal<T> {
  if (raw === undefined || !guard(raw)) return none();
  return { value: raw, conf: conf ?? base };
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

export function normalise(title: string, description = ''): Normalised {
  const haystack = `${title} ${description}`;

  const rejectionReason = classifyRejection(title);
  const capacityBytes = parseCapacity(title);
  const hit = lookupDictionary(title);
  const entry = hit?.entry;

  /**
   * Axes this family cannot resolve from ANY listing — CLAUDE.md §3.3, the
   * "permanently unknowable" clause.
   *
   * The distinction the rule turns on is whether the fact exists to be read.
   * A WD Blue whose title omitted the model number has a knowable recording
   * technology that this particular listing did not state, so it quarantines
   * until a listing does. What is inside a sealed WD Elements is not disclosed
   * by anyone and varies by production run, so no listing will ever state it —
   * there is no future in which quarantining resolves anything.
   *
   * For those axes we assert nothing, publish the value as null, and leave the
   * axis out of the confidence minimum. `passes()` still refuses to match a
   * null axis against a filter on it, so such a row can never surface in a
   * technology-filtered view; it appears in the unfiltered table and on
   * /hdd/shuckable with "Technology: —", which is the true statement.
   */
  const unknowableAxes = new Set(entry?.unknowable ?? []);

  // Technology precedence: an explicit CMR/SMR/NAND token beats the curated
  // table, which beats the family-name regexes. CLAUDE.md §3.3 requires the
  // recording technology to come from the curated table rather than the
  // title's family name — but a seller stating "CMR" outright is evidence
  // about this unit, not an inference.
  const explicitTech = explicitTechnology(haystack);
  const dictTech = dictSignal<Technology>(
    entry?.technology,
    isTechnology,
    entry?.technologyConfidence,
    entry?.confidence ?? 0,
  );
  const regexTech = classifyTechnology(haystack);
  const tech: Signal<Technology> =
    explicitTech.value !== null
      ? // A seller stating "CMR" outright is evidence about THIS unit, and it
        // beats even an unknowable declaration — the enclosure is sealed, but
        // the person who opened it is not guessing.
        explicitTech
      : unknowableAxes.has('technology')
        ? // Suppress the family regex too. Its HDD fallback would return
          // hdd_cmr at 0.4, which is the guess this clause exists to refuse.
          none()
        : entry?.technology !== undefined
          ? dictTech
          : regexTech;

  // Form factor and interface: the dictionary wins when it has an opinion.
  // When it omits the field it is deliberately deferring — Exos and Ultrastar
  // ship in both SATA and SAS, so the title decides.
  const dictFf = dictSignal<FormFactor>(
    entry?.formFactor,
    isFormFactor,
    entry?.formFactorConfidence,
    entry?.confidence ?? 0,
  );
  const ff = unknowableAxes.has('formFactor')
    ? none<FormFactor>()
    : dictFf.value !== null
      ? dictFf
      : classifyFormFactor(haystack);

  const dictIface = dictSignal<Interface>(
    entry?.interface,
    isInterface,
    entry?.interfaceConfidence,
    entry?.confidence ?? 0,
  );
  const iface = unknowableAxes.has('interface')
    ? none<Interface>()
    : dictIface.value !== null
      ? dictIface
      : classifyInterface(haystack);

  // MINIMUM, not mean — see CLAUDE.md §3.3. A listing with perfect capacity
  // but an unknown interface must not surface in an interface-filtered view
  // just because two other axes were confident.
  //
  // A declared-unknowable axis that came back null is left OUT of the minimum
  // rather than contributing zero. It is not a failed reading, so it is not
  // evidence about how well the rest of the listing was read.
  const scored: number[] = [capacityBytes ? 1 : 0];
  for (const [axis, signal] of [
    ['technology', tech],
    ['formFactor', ff],
    ['interface', iface],
  ] as const) {
    if (signal.value === null && unknowableAxes.has(axis)) continue;
    scored.push(signal.conf);
  }

  const confidence = rejectionReason ? 0 : Math.min(...scored);

  const warrantyYears = parseWarrantyYears(haystack) ?? entry?.warrantyYears ?? null;
  const parsedWarranty = parseHasWarranty(haystack);

  return {
    capacityBytes,
    lotSize: parseLotSize(title),
    technology: tech.value,
    formFactor: ff.value,
    interface: iface.value,
    rpm: parseRpm(haystack) ?? entry?.rpm ?? null,
    powerOnHours: parsePowerOnHours(haystack),
    confidence,

    brand: entry?.brand ?? null,
    family: entry?.family ?? null,
    warrantyYears,
    hasWarranty: parsedWarranty,
    returnPolicy: parseReturnPolicy(haystack),
    shuckable: entry?.shuckable ?? false,
    shuckedEquivalent: entry?.shuckedEquivalent ?? null,
    dictionaryId: entry?.id ?? null,
    rejected: rejectionReason !== null,
    rejectionReason,
  };
}

export function isPublishable(n: Normalised): boolean {
  return !n.rejected && n.capacityBytes !== null && n.confidence >= CONFIDENCE_THRESHOLD;
}
