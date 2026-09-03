/**
 * The filter axes — single source of truth.
 *
 * These keys are simultaneously the API surface, the URL parameters and the
 * database values. Nothing else in the codebase declares them, and they are
 * not renamed for tidiness: a rename is a breaking change to every shared
 * link, every landing route and every stored row at once.
 *
 * See CLAUDE.md §3.1.
 */

export const TECHNOLOGY = {
  hdd_cmr: 'HDD · CMR',
  hdd_smr: 'HDD · SMR',
  sshd: 'Hybrid SSHD',
  ssd_tlc: 'SSD · TLC NAND',
  ssd_qlc: 'SSD · QLC NAND',
  ssd_mlc: 'SSD · MLC NAND',
} as const;

export const FORM_FACTOR = {
  '3.5': '3.5-inch',
  '2.5': '2.5-inch',
  m2_2280: 'M.2 2280',
  m2_2230: 'M.2 2230',
  u2: 'U.2 / U.3',
  ext_desktop: 'External desktop',
  ext_portable: 'External portable',
} as const;

export const INTERFACE = {
  sata3: 'SATA III 6Gb/s',
  sas12: 'SAS 12Gb/s',
  pcie3: 'PCIe 3.0 ×4 (NVMe)',
  pcie4: 'PCIe 4.0 ×4 (NVMe)',
  pcie5: 'PCIe 5.0 ×4 (NVMe)',
  usb_g1: 'USB 3.2 Gen 1',
  usb_g2: 'USB 3.2 Gen 2',
  usb_g2x2: 'USB 3.2 Gen 2×2',
} as const;

export const CONDITION = {
  new: 'New',
  renewed: 'Renewed',
  used: 'Used',
} as const;

export const MARKETPLACE = {
  amazon: 'Amazon',
  ebay: 'eBay',
} as const;

export type Technology = keyof typeof TECHNOLOGY;
export type FormFactor = keyof typeof FORM_FACTOR;
export type Interface = keyof typeof INTERFACE;
export type Condition = keyof typeof CONDITION;
export type Marketplace = keyof typeof MARKETPLACE;

/**
 * The enum-valued filter axes, in display order.
 *
 * The brief calls these "the four independent axes" in prose but specifies
 * five enumerations, and ticket 3.1 asks the query layer for *five*
 * independent facet count maps. Five it is: `passes(row, query, skipAxis)`
 * iterates this list, so every enumeration gets the skip-your-own-axis
 * treatment and none of them can silently degrade into a radio group.
 *
 * Ticket 3.4 renders four checkbox groups in the rail; which enumeration is
 * presented differently is a Phase 3 presentation decision, not a reason to
 * exclude an axis from the counting invariant.
 */
export const AXES = [
  'technology',
  'formFactor',
  'interface',
  'condition',
  'marketplace',
] as const;

export type Axis = (typeof AXES)[number];

/** Maps each axis to the union of values it accepts. */
export interface AxisValues {
  technology: Technology;
  formFactor: FormFactor;
  interface: Interface;
  condition: Condition;
  marketplace: Marketplace;
}

/** Maps each axis to its label table, for generic iteration in the UI. */
export const AXIS_OPTIONS = {
  technology: TECHNOLOGY,
  formFactor: FORM_FACTOR,
  interface: INTERFACE,
  condition: CONDITION,
  marketplace: MARKETPLACE,
} as const;

export const AXIS_LABELS: Record<Axis, string> = {
  technology: 'Technology',
  formFactor: 'Form factor',
  interface: 'Interface',
  condition: 'Condition',
  marketplace: 'Marketplace',
};

const keysOf = <T extends Record<string, string>>(o: T): (keyof T)[] =>
  Object.keys(o) as (keyof T)[];

export const TECHNOLOGY_KEYS = keysOf(TECHNOLOGY);
export const FORM_FACTOR_KEYS = keysOf(FORM_FACTOR);
export const INTERFACE_KEYS = keysOf(INTERFACE);
export const CONDITION_KEYS = keysOf(CONDITION);
export const MARKETPLACE_KEYS = keysOf(MARKETPLACE);

/** Valid keys per axis, for generic validation and iteration. */
export const AXIS_KEYS: { [K in Axis]: readonly AxisValues[K][] } = {
  technology: TECHNOLOGY_KEYS,
  formFactor: FORM_FACTOR_KEYS,
  interface: INTERFACE_KEYS,
  condition: CONDITION_KEYS,
  marketplace: MARKETPLACE_KEYS,
};

export function isTechnology(v: unknown): v is Technology {
  return typeof v === 'string' && v in TECHNOLOGY;
}
export function isFormFactor(v: unknown): v is FormFactor {
  return typeof v === 'string' && v in FORM_FACTOR;
}
export function isInterface(v: unknown): v is Interface {
  return typeof v === 'string' && v in INTERFACE;
}
export function isCondition(v: unknown): v is Condition {
  return typeof v === 'string' && v in CONDITION;
}
export function isMarketplace(v: unknown): v is Marketplace {
  return typeof v === 'string' && v in MARKETPLACE;
}

/** Generic membership test used by query parsing to drop unknown keys. */
export function isAxisValue<K extends Axis>(axis: K, v: unknown): v is AxisValues[K] {
  return typeof v === 'string' && v in AXIS_OPTIONS[axis];
}

export function labelFor<K extends Axis>(axis: K, value: AxisValues[K]): string {
  return (AXIS_OPTIONS[axis] as Record<string, string>)[value as string] ?? value;
}

/**
 * Convenience groupings used by landing routes and the mock catalogue.
 * These are derived views, never a second source of truth.
 */
export const HDD_TECHNOLOGIES = [
  'hdd_cmr',
  'hdd_smr',
  'sshd',
] as const satisfies readonly Technology[];

export const SSD_TECHNOLOGIES = [
  'ssd_tlc',
  'ssd_qlc',
  'ssd_mlc',
] as const satisfies readonly Technology[];

export const EXTERNAL_FORM_FACTORS = [
  'ext_desktop',
  'ext_portable',
] as const satisfies readonly FormFactor[];

export const USB_INTERFACES = [
  'usb_g1',
  'usb_g2',
  'usb_g2x2',
] as const satisfies readonly Interface[];

export function isHdd(t: Technology): boolean {
  return (HDD_TECHNOLOGIES as readonly Technology[]).includes(t);
}
export function isSsd(t: Technology): boolean {
  return (SSD_TECHNOLOGIES as readonly Technology[]).includes(t);
}

/**
 * The three boolean adjustments that sit alongside the axes and the capacity
 * range. `includeShipping` defaults to true — see CLAUDE.md §3.2: without it,
 * eBay's $0.99-item-plus-$28-shipping listings top the table permanently.
 */
export interface Adjustments {
  includeShipping: boolean;
  hideLots: boolean;
  inStockOnly: boolean;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  includeShipping: true,
  hideLots: false,
  inStockOnly: true,
};
