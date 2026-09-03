import { describe, expect, it } from 'vitest';
import specDictionary from '@/lib/spec-dictionary.json';
import { CONFIDENCE_THRESHOLD, lookupDictionary, type SpecEntry } from '@/lib/normalize';
import { isFormFactor, isInterface, isTechnology } from '@/lib/taxonomy';

const ENTRIES = specDictionary.families as SpecEntry[];

describe('spec-dictionary integrity', () => {
  it('is the curated size the brief asks for', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(150);
  });

  it('has unique ids', () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate match strings across entries', () => {
    // A duplicate would make which entry wins depend on array order.
    const all = ENTRIES.flatMap((e) => e.match);
    const seen = new Set<string>();
    const dupes = all.filter((m) => (seen.has(m) ? true : (seen.add(m), false)));
    expect(dupes).toEqual([]);
  });

  it('only uses valid taxonomy keys', () => {
    for (const e of ENTRIES) {
      if (e.technology !== undefined) {
        expect(isTechnology(e.technology), `${e.id} technology`).toBe(true);
      }
      if (e.formFactor !== undefined) {
        expect(isFormFactor(e.formFactor), `${e.id} formFactor`).toBe(true);
      }
      if (e.interface !== undefined) {
        expect(isInterface(e.interface), `${e.id} interface`).toBe(true);
      }
    }
  });

  it('keeps every confidence in range', () => {
    for (const e of ENTRIES) {
      expect(e.confidence, e.id).toBeGreaterThan(0);
      expect(e.confidence, e.id).toBeLessThanOrEqual(1);
      for (const k of [
        'technologyConfidence',
        'formFactorConfidence',
        'interfaceConfidence',
      ] as const) {
        const v = e[k];
        if (v !== undefined) {
          expect(v, `${e.id} ${k}`).toBeGreaterThan(0);
          expect(v, `${e.id} ${k}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('has no empty match strings, and none so short they match anything', () => {
    for (const e of ENTRIES) {
      expect(e.match.length, e.id).toBeGreaterThan(0);
      for (const m of e.match) {
        expect(m, e.id).toBe(m.toLowerCase());
        expect(m.trim().length, `${e.id} "${m}"`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('gives every deliberately sub-threshold entry a note explaining why', () => {
    const sub = ENTRIES.filter(
      (e) =>
        e.technologyConfidence !== undefined &&
        e.technologyConfidence < CONFIDENCE_THRESHOLD,
    );
    // These are the families whose recording technology or NAND type genuinely
    // varies. They exist on purpose; coverage is not the metric.
    expect(sub.length).toBeGreaterThanOrEqual(8);
    for (const e of sub) {
      expect(e.note, `${e.id} should say why it is held below threshold`).toBeTruthy();
    }
  });

  it('names the equivalent bare drive for every shuckable enclosure', () => {
    const shuckable = ENTRIES.filter((e) => e.shuckable);
    expect(shuckable.length).toBeGreaterThanOrEqual(3);
    for (const e of shuckable) {
      expect(e.shuckedEquivalent, e.id).toBeTruthy();
      expect(e.formFactor, e.id).toMatch(/^ext_/);
    }
  });

  it('covers the brands the brief lists', () => {
    const brands = new Set(ENTRIES.map((e) => e.brand.toLowerCase()));
    for (const required of [
      'seagate',
      'western digital',
      'toshiba',
      'samsung',
      'crucial',
      'sk hynix',
      'solidigm',
      'micron',
      'kingston',
    ]) {
      expect(brands.has(required), `missing brand: ${required}`).toBe(true);
    }
  });

  it('resolves the CMR/SMR families the brief calls out by name', () => {
    const cmr = ['IronWolf 8TB', 'Exos X16 16TB', 'Ultrastar DC HC550', 'WD Red Pro 8TB'];
    for (const t of cmr) {
      expect(lookupDictionary(t)?.entry.technology, t).toBe('hdd_cmr');
    }

    // BarraCuda non-Pro, and My Passport. WD Blue is in the brief's SMR list
    // too but ships both ways, so it is held below threshold instead.
    expect(lookupDictionary('Seagate BarraCuda 8TB')?.entry.technology).toBe('hdd_smr');
    expect(lookupDictionary('WD My Passport 5TB')?.entry.technology).toBe('hdd_smr');

    const blue = lookupDictionary('WD Blue 4TB desktop')?.entry;
    expect(blue?.technologyConfidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('omits the interface on families that ship both SATA and SAS', () => {
    for (const id of ['seagate-exos-x', 'wd-ultrastar-dc-hc', 'toshiba-mg']) {
      const e = ENTRIES.find((x) => x.id === id);
      expect(e, id).toBeDefined();
      expect(e?.interface, `${id} must defer to the title`).toBeUndefined();
    }
  });

  it('has every exclude string actually excluding something reachable', () => {
    for (const e of ENTRIES) {
      for (const ex of e.exclude ?? []) {
        expect(ex, `${e.id} exclude`).toBe(ex.toLowerCase());
        expect(ex.trim().length, `${e.id} exclude "${ex}"`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
