import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  activeFilterCount,
  isDefaultQuery,
  parseQuery,
  queryToSearchString,
  querySchema,
  serialiseQuery,
  toggleAxisValue,
} from '@/lib/query';
import { AXES } from '@/lib/taxonomy';

const parse = (search: string) => parseQuery(new URLSearchParams(search));

describe('parseQuery', () => {
  it('defaults to the unfiltered view with shipping included', () => {
    const q = parseQuery();
    expect(q).toEqual(EMPTY_QUERY);
    expect(q.includeShipping).toBe(true);
    expect(q.inStockOnly).toBe(true);
    expect(q.hideLots).toBe(false);
  });

  it('reads comma-separated lists', () => {
    expect(parse('condition=used,renewed').condition).toEqual(['renewed', 'used']);
  });

  it('reads repeated parameters', () => {
    expect(parse('technology=hdd_cmr&technology=ssd_tlc').technology).toEqual([
      'hdd_cmr',
      'ssd_tlc',
    ]);
  });

  it('reads the landing-route filters from the brief verbatim', () => {
    // Appendix C: /hdd/nas
    const nas = parse('technology=hdd_cmr&formFactor=3.5&capMin=4');
    expect(nas.technology).toEqual(['hdd_cmr']);
    expect(nas.formFactor).toEqual(['3.5']);
    expect(nas.capMin).toBe(4);

    // /hdd/used-enterprise
    const used = parse('condition=used,renewed&formFactor=3.5&capMin=8');
    expect(used.condition).toEqual(['renewed', 'used']);

    // /ssd/m2-2230 — the Steam Deck query
    expect(parse('formFactor=m2_2230').formFactor).toEqual(['m2_2230']);

    // /hdd/shuckable
    expect(parse('shuckable=true').shuckable).toBe(true);
  });

  it('deduplicates repeated values', () => {
    expect(parse('technology=hdd_cmr,hdd_cmr,hdd_cmr').technology).toEqual(['hdd_cmr']);
  });
});

describe('unknown keys are dropped silently, not rejected', () => {
  it('keeps the valid values and discards the rest', () => {
    // A link shared before a taxonomy change must still render a useful table.
    const q = parse('technology=hdd_cmr,hdd_pmr,ssd_xlc,ssd_tlc');
    expect(q.technology).toEqual(['hdd_cmr', 'ssd_tlc']);
  });

  it('does not throw on entirely unknown values', () => {
    expect(() => parse('interface=scsi1&formFactor=5.25')).not.toThrow();
    const q = parse('interface=scsi1&formFactor=5.25');
    expect(q.interface).toEqual([]);
    expect(q.formFactor).toEqual([]);
  });

  it('ignores unknown parameters entirely', () => {
    expect(() => parse('utm_source=reddit&fbclid=abc123')).not.toThrow();
    expect(isDefaultQuery(parse('utm_source=reddit'))).toBe(true);
  });

  it('falls back to the default on an unparseable boolean or sort', () => {
    expect(parse('shipping=maybe').includeShipping).toBe(true);
    expect(parse('sort=cheapest').sort).toBe('ppt_asc');
  });

  it('drops a capacity outside the publishable envelope', () => {
    expect(parse('capMin=0.001').capMin).toBeNull();
    expect(parse('capMax=999').capMax).toBeNull();
    expect(parse('capMin=notanumber').capMin).toBeNull();
  });
});

describe('boolean adjustments', () => {
  it('accepts the spellings a hand-edited URL uses', () => {
    for (const on of ['1', 'true', 'yes', 'on']) {
      expect(parse(`hideLots=${on}`).hideLots).toBe(true);
    }
    for (const off of ['0', 'false', 'no', 'off']) {
      expect(parse(`shipping=${off}`).includeShipping).toBe(false);
    }
  });

  it('treats shuckable as tri-state', () => {
    expect(parse('').shuckable).toBeNull();
    expect(parse('shuckable=1').shuckable).toBe(true);
    expect(parse('shuckable=0').shuckable).toBe(false);
  });
});

describe('capacity range', () => {
  it('swaps a reversed range rather than matching nothing', () => {
    const q = parse('capMin=20&capMax=4');
    expect(q.capMin).toBe(4);
    expect(q.capMax).toBe(20);
  });
});

describe('serialiseQuery', () => {
  it('emits nothing for the default view', () => {
    expect(serialiseQuery(EMPTY_QUERY).toString()).toBe('');
    expect(queryToSearchString(EMPTY_QUERY)).toBe('');
  });

  it('omits adjustments that match their defaults', () => {
    const q = {
      ...EMPTY_QUERY,
      includeShipping: true,
      inStockOnly: true,
      hideLots: false,
    };
    expect(serialiseQuery(q).toString()).toBe('');
  });

  it('emits adjustments that differ', () => {
    const s = serialiseQuery({ ...EMPTY_QUERY, includeShipping: false }).toString();
    expect(s).toBe('shipping=0');
  });

  it('is stable regardless of the order values were selected in', () => {
    const a = serialiseQuery({ ...EMPTY_QUERY, technology: ['ssd_tlc', 'hdd_cmr'] });
    const b = serialiseQuery({ ...EMPTY_QUERY, technology: ['hdd_cmr', 'ssd_tlc'] });
    expect(a.toString()).toBe(b.toString());
    // Taxonomy order, so the cache tag and canonical link never vary by click path.
    expect(a.toString()).toBe('technology=hdd_cmr%2Cssd_tlc');
  });
});

describe('round trip', () => {
  const cases: string[] = [
    '',
    'technology=hdd_cmr',
    'technology=hdd_cmr,ssd_qlc&formFactor=3.5&interface=sas12',
    'condition=used,renewed&capMin=8',
    'capMin=4&capMax=20',
    'shipping=0&hideLots=1&inStock=0',
    'shuckable=1',
    'sort=capacity_desc',
    'marketplace=ebay&condition=used&interface=pcie5&sort=ppt_desc',
  ];

  it.each(cases)('parse(serialise(parse(%s))) is stable', (search) => {
    const once = parse(search);
    const twice = parseQuery(serialiseQuery(once));
    expect(twice).toEqual(once);
  });

  it('produces a query the zod schema accepts', () => {
    for (const search of cases) {
      expect(() => querySchema.parse(parse(search))).not.toThrow();
    }
  });
});

describe('helpers', () => {
  it('counts active filters', () => {
    expect(activeFilterCount(EMPTY_QUERY)).toBe(0);
    expect(activeFilterCount(parse('technology=hdd_cmr,hdd_smr&capMin=4'))).toBe(3);
    expect(activeFilterCount(parse('shipping=0'))).toBe(1);
  });

  it('toggles an axis value on and off', () => {
    const on = toggleAxisValue(EMPTY_QUERY, 'interface', 'pcie4');
    expect(on.interface).toEqual(['pcie4']);
    expect(toggleAxisValue(on, 'interface', 'pcie4').interface).toEqual([]);
  });

  it('does not mutate the input', () => {
    const before = { ...EMPTY_QUERY };
    toggleAxisValue(EMPTY_QUERY, 'technology', 'hdd_cmr');
    expect(EMPTY_QUERY).toEqual(before);
  });
});

describe('every axis is addressable from the URL', () => {
  it.each(AXES)('%s', (axis) => {
    const q = parseQuery({ [axis]: 'nonsense' });
    expect(q[axis]).toEqual([]);
    expect(Object.keys(EMPTY_QUERY)).toContain(axis);
  });
});
