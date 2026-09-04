import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AXES,
  AXIS_KEYS,
  AXIS_LABELS,
  AXIS_OPTIONS,
  CONDITION,
  FORM_FACTOR,
  INTERFACE,
  MARKETPLACE,
  TECHNOLOGY,
  isAxisValue,
  isHdd,
  isSsd,
  labelFor,
} from '@/lib/taxonomy';

describe('the axes are exactly what the brief specifies', () => {
  it('technology', () => {
    expect(Object.keys(TECHNOLOGY)).toEqual([
      'hdd_cmr',
      'hdd_smr',
      'sshd',
      'ssd_tlc',
      'ssd_qlc',
      'ssd_mlc',
    ]);
    expect(TECHNOLOGY.hdd_cmr).toBe('HDD · CMR');
    expect(TECHNOLOGY.ssd_tlc).toBe('SSD · TLC NAND');
  });

  it('form factor', () => {
    expect(Object.keys(FORM_FACTOR)).toEqual([
      '3.5',
      '2.5',
      'm2_2280',
      'm2_2230',
      'u2',
      'ext_desktop',
      'ext_portable',
    ]);
    expect(FORM_FACTOR.u2).toBe('U.2 / U.3');
  });

  it('interface', () => {
    expect(Object.keys(INTERFACE)).toEqual([
      'sata3',
      'sas12',
      'pcie3',
      'pcie4',
      'pcie5',
      'usb_g1',
      'usb_g2',
      'usb_g2x2',
    ]);
    expect(INTERFACE.pcie5).toBe('PCIe 5.0 ×4 (NVMe)');
    expect(INTERFACE.usb_g2x2).toBe('USB 3.2 Gen 2×2');
  });

  it('condition and marketplace', () => {
    expect(Object.keys(CONDITION)).toEqual(['new', 'renewed', 'used']);
    expect(Object.keys(MARKETPLACE)).toEqual(['amazon', 'ebay']);
  });
});

describe('axis registry', () => {
  it('lists every enum-valued axis', () => {
    expect([...AXES]).toEqual([
      'technology',
      'formFactor',
      'interface',
      'condition',
      'marketplace',
    ]);
  });

  it('keeps AXIS_OPTIONS, AXIS_KEYS and AXIS_LABELS aligned with AXES', () => {
    for (const axis of AXES) {
      expect(AXIS_OPTIONS[axis]).toBeDefined();
      expect(AXIS_LABELS[axis]).toBeTruthy();
      expect(AXIS_KEYS[axis]).toEqual(Object.keys(AXIS_OPTIONS[axis]));
    }
    expect(Object.keys(AXIS_OPTIONS)).toEqual([...AXES]);
  });

  it('validates values per axis', () => {
    expect(isAxisValue('technology', 'hdd_cmr')).toBe(true);
    expect(isAxisValue('technology', 'ssd_tlc')).toBe(true);
    expect(isAxisValue('technology', 'hdd_pmr')).toBe(false);
    expect(isAxisValue('formFactor', '3.5')).toBe(true);
    expect(isAxisValue('formFactor', 'm2_2280')).toBe(true);
    expect(isAxisValue('interface', 'sata3')).toBe(true);
    expect(isAxisValue('marketplace', 'newegg')).toBe(false);
  });

  it('labels values', () => {
    expect(labelFor('interface', 'sas12')).toBe('SAS 12Gb/s');
    expect(labelFor('formFactor', '3.5')).toBe('3.5-inch');
  });
});

describe('derived groupings', () => {
  it('splits HDD from SSD without a second source of truth', () => {
    expect(isHdd('hdd_cmr')).toBe(true);
    expect(isHdd('sshd')).toBe(true);
    expect(isHdd('ssd_tlc')).toBe(false);
    expect(isSsd('ssd_qlc')).toBe(true);
    expect(isSsd('hdd_smr')).toBe(false);
  });

  it('covers every technology exactly once between the two groups', () => {
    const covered = Object.keys(TECHNOLOGY).filter(
      (t) => isHdd(t as never) !== isSsd(t as never),
    );
    expect(covered.length).toBe(Object.keys(TECHNOLOGY).length);
  });
});

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

describe('prisma/schema.prisma mirrors taxonomy.ts', () => {
  const schema = readFileSync(
    join(resolve(__dirname, '..', '..'), 'prisma', 'schema.prisma'),
    'utf8',
  );

  /** Reads an enum body, resolving `@map("...")` back to the wire value. */
  function prismaEnum(name: string): string[] {
    const m = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
    expect(m, `enum ${name} not found in schema.prisma`).not.toBeNull();
    return (m?.[1] ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//'))
      .map((l) => {
        const mapped = l.match(/@map\("([^"]+)"\)/);
        return mapped?.[1] ?? l.split(/\s+/)[0] ?? '';
      });
  }

  it.each([
    ['Technology', TECHNOLOGY],
    ['FormFactor', FORM_FACTOR],
    ['Interface', INTERFACE],
    ['Condition', CONDITION],
    ['Marketplace', MARKETPLACE],
  ] as const)('%s', (enumName, source) => {
    // The database values must equal the taxonomy keys exactly, in order.
    // These are also the URL parameters, so a drift here silently breaks every
    // shared link and every landing route at once.
    expect(prismaEnum(enumName)).toEqual(Object.keys(source));
  });

  it('stores capacityBytes as a BigInt', () => {
    // Known trap 2: 24TB overflows a 32-bit int, and rounding storage capacity
    // is how a wrong $/TB gets in.
    expect(schema).toMatch(/capacityBytes\s+BigInt/);
  });

  it('keeps expiresAt indexed, because every read path filters on it', () => {
    expect(schema).toMatch(/expiresAt\s+DateTime/);
    expect(schema).toMatch(/@@index\(\[expiresAt\]\)/);
  });

  it('does not store a derived price-per-terabyte column', () => {
    // $/TB is derived at read time; the shipping and lot rules are toggleable,
    // so a stored figure would be wrong for half the views.
    expect(schema).not.toMatch(/pricePerTb|price_per_tb|pptCents/i);
  });
});
