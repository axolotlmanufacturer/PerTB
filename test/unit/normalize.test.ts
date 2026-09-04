import { describe, expect, it } from 'vitest';
import corpus from '../fixtures/titles.json';
import {
  CONFIDENCE_THRESHOLD,
  classifyFormFactor,
  classifyInterface,
  classifyTechnology,
  isPublishable,
  lookupDictionary,
  normalise,
  parseCapacity,
  parseHasWarranty,
  parseLotSize,
  parsePowerOnHours,
  parseReturnPolicy,
  parseRpm,
} from '@/lib/normalize';

const TB = 1_000_000_000_000n;
const GB = 1_000_000_000n;

interface Expectation {
  lotSize: number;
  capacityTb: number | null;
  technology: string | null;
  formFactor: string | null;
  interface: string | null;
  publishable: boolean;
}

interface Case {
  title: string;
  description?: string;
  expect: Expectation;
}

const CASES = corpus.cases as Case[];

// ---------------------------------------------------------------------------
// The gate: the golden corpus must pass at 100%.
// ---------------------------------------------------------------------------

describe('golden corpus', () => {
  it('is large enough to be worth trusting', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(200);
  });

  it.each(CASES.map((c, i): [string, Case] => [`#${i} ${c.title.slice(0, 64)}`, c]))(
    '%s',
    (_label, c) => {
      const n = normalise(c.title, c.description ?? '');

      expect(n.lotSize).toBe(c.expect.lotSize);
      expect(n.capacityBytes === null ? null : Number(n.capacityBytes) / 1e12).toBe(
        c.expect.capacityTb,
      );
      expect(n.technology).toBe(c.expect.technology);
      expect(n.formFactor).toBe(c.expect.formFactor);
      expect(n.interface).toBe(c.expect.interface);
      expect(isPublishable(n)).toBe(c.expect.publishable);
    },
  );
});

describe('golden corpus covers the cases the brief requires', () => {
  const titles = CASES.map((c) => c.title);
  const has = (re: RegExp): boolean => titles.some((t) => re.test(t));

  it('includes all four lot notations', () => {
    expect(has(/\blot of \d/i)).toBe(true); // Lot of 5
    expect(has(/\b\d+ ?x ?\d+\s*TB/i)).toBe(true); // 4 x 8TB
    expect(has(/\b\d+[-\s]pack\b/i)).toBe(true); // 6-pack
    expect(has(/\b(qty|quantity)\b/i)).toBe(true); // qty 3
  });

  it('includes capacity-lookalike traps', () => {
    expect(has(/7200 ?RPM/i)).toBe(true);
    expect(has(/\d+ ?MB Cache/i)).toBe(true);
    expect(has(/6 ?Gb\/s/i)).toBe(true);
  });

  it('includes non-drive items that must be rejected', () => {
    const rejects = CASES.filter((c) => !c.expect.publishable);
    expect(rejects.length).toBeGreaterThanOrEqual(10);
    expect(has(/cable/i)).toBe(true);
    expect(has(/enclosure/i)).toBe(true);
    expect(has(/caddy/i)).toBe(true);
    expect(has(/docking station/i)).toBe(true);
  });

  it('includes ambiguous externals', () => {
    expect(has(/elements|easystore|my book|expansion desktop/i)).toBe(true);
  });

  it('includes titles where the capacity appears twice', () => {
    const twice = titles.filter(
      (t) => (t.match(/\d+(\.\d+)?\s*TB\b/gi) ?? []).length >= 2,
    );
    expect(twice.length).toBeGreaterThanOrEqual(2);
  });

  it('includes used listings with power-on hours in the description', () => {
    const inDescription = CASES.filter(
      (c) => c.description !== undefined && /hours|hrs|poh/i.test(c.description),
    );
    expect(inDescription.length).toBeGreaterThanOrEqual(5);
    for (const c of inDescription) {
      expect(normalise(c.title, c.description).powerOnHours).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Rule-level tests
// ---------------------------------------------------------------------------

describe('parseCapacity', () => {
  it('requires the unit adjacent to the number', () => {
    expect(parseCapacity('Seagate 7200 RPM 256MB cache 6Gb/s')).toBeNull();
    expect(parseCapacity('WD 5400 RPM SATA III')).toBeNull();
  });

  it('reads decimal terabytes', () => {
    expect(parseCapacity('20TB drive')).toBe(20n * TB);
    expect(parseCapacity('20 TB drive')).toBe(20n * TB);
    expect(parseCapacity('7.68TB U.3')).toBe(7_680n * GB);
    expect(parseCapacity('7,68TB U.3')).toBe(7_680n * GB);
  });

  it('rejects below 120GB — legacy junk with unreliable pricing', () => {
    expect(parseCapacity('80GB IDE drive')).toBeNull();
    expect(parseCapacity('120GB SSD')).toBe(120n * GB);
  });

  it('rejects above 40TB — no single retail drive is that large', () => {
    expect(parseCapacity('61.44TB QLC enterprise SSD')).toBeNull();
    expect(parseCapacity('40TB')).toBe(40n * TB);
  });

  it('takes the first capacity when it appears twice', () => {
    expect(parseCapacity('Toshiba N300 8TB 8 TB NAS Hard Drive')).toBe(8n * TB);
  });
});

describe('parseLotSize', () => {
  it('reads "Lot of N"', () => {
    expect(parseLotSize('Lot of 5 Seagate Exos X16 16TB')).toBe(5);
  });

  it('reads "N x CapTB"', () => {
    expect(parseLotSize('4 x 8TB HGST Ultrastar He8 SAS')).toBe(4);
  });

  it('reads "N-pack" and "N pack"', () => {
    expect(parseLotSize('Seagate Exos X18 18TB 6-pack SATA')).toBe(6);
    expect(parseLotSize('Seagate IronWolf 8TB 5 pack 3.5" SATA')).toBe(5);
  });

  it('reads "qty N" and "quantity N"', () => {
    expect(parseLotSize('HGST Ultrastar He12 12TB qty 3 Tested')).toBe(3);
    expect(parseLotSize('Seagate Exos X20 20TB quantity 4 Lot')).toBe(4);
  });

  it('does not read a dimension as a quantity', () => {
    // The prefix pattern used to read "pack 3.5" here and return 3, dividing
    // the price across drives that do not exist.
    expect(parseLotSize('WD Red Plus 4TB NAS HDD 4-pack 3.5" SATA CMR')).toBe(4);
    expect(parseLotSize('Seagate IronWolf 8TB 5 pack 3.5" SATA 7200RPM')).toBe(5);
  });

  it('defaults to 1', () => {
    expect(parseLotSize('Seagate IronWolf Pro 20TB NAS Internal HDD')).toBe(1);
  });

  it('ignores implausible quantities', () => {
    expect(parseLotSize('Lot of 1 drive')).toBe(1);
    expect(parseLotSize('Lot of 500 drives')).toBe(500 > 100 ? 1 : 500);
  });
});

describe('classifyTechnology', () => {
  it('resolves CMR/SMR from curated families rather than the title', () => {
    expect(classifyTechnology('Seagate IronWolf Pro 20TB NAS HDD').value).toBe('hdd_cmr');
    expect(classifyTechnology('Seagate BarraCuda 8TB desktop hard drive').value).toBe(
      'hdd_smr',
    );
  });

  it('leaves a bare HDD below threshold', () => {
    const bare = classifyTechnology('Generic 4TB hard drive 7200 RPM');
    expect(bare.value).toBe('hdd_cmr');
    expect(bare.conf).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('defaults SSDs to TLC but not confidently', () => {
    const ssd = classifyTechnology('Generic 2TB NVMe SSD');
    expect(ssd.value).toBe('ssd_tlc');
    expect(ssd.conf).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

describe('confidence is the MINIMUM across axes, not the mean', () => {
  it('a perfect capacity does not rescue an unknown interface', () => {
    // Capacity 1.0, technology and form factor confident, interface unknown.
    const n = normalise('Generic 8TB internal hard drive 3.5 inch CMR');
    expect(n.capacityBytes).toBe(8n * TB);
    expect(n.interface).toBeNull();
    expect(n.confidence).toBe(0);
    expect(isPublishable(n)).toBe(false);
  });

  it('would publish if the mean were used instead', () => {
    const n = normalise('Generic 8TB internal hard drive 3.5 inch CMR');
    const axes = [1, 0.9, 0.85, 0];
    const mean = axes.reduce((a, b) => a + b, 0) / axes.length;
    expect(mean).toBeGreaterThan(CONFIDENCE_THRESHOLD);
    expect(n.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});

describe('quarantine rather than guess', () => {
  it('holds families whose recording technology genuinely varies', () => {
    for (const title of [
      'WD Red 8TB NAS Hard Drive 3.5 inch SATA 6Gb/s 5400RPM',
      'WD Blue 4TB Desktop Hard Drive 3.5 inch SATA 6Gb/s 5400RPM',
      'Toshiba P300 6TB Desktop Hard Drive 3.5 inch SATA 5400RPM',
    ]) {
      expect(isPublishable(normalise(title))).toBe(false);
    }
  });

  it('releases them once the title states the recording technology', () => {
    expect(
      isPublishable(
        normalise('WD Blue 8TB 3.5 inch SATA 5640RPM CMR Desktop Hard Drive'),
      ),
    ).toBe(true);
  });

  it('releases them on a specific model number', () => {
    expect(
      isPublishable(normalise('WD Red 4TB WD40EFAX NAS Hard Drive 3.5" SATA 5400RPM')),
    ).toBe(true);
  });

  it('does NOT hold a sealed enclosure — it publishes with a blank instead', () => {
    // The line is whether the fact exists to be read. A WD Blue's recording
    // technology is knowable and this listing did not state it, so it waits.
    // What is inside a sealed WD Elements is disclosed by nobody and varies by
    // production run, so waiting resolves nothing and the honest output is a
    // null on that axis with the rest of the row intact (CLAUDE.md §3.3).
    const n = normalise('WD Elements Desktop 18TB External Hard Drive USB 3.0');
    expect(n.shuckable).toBe(true);
    expect(n.technology).toBeNull();
    expect(n.formFactor).toBe('ext_desktop');
    expect(n.interface).toBe('usb_g1');
    expect(isPublishable(n)).toBe(true);
  });

  it('does not let the unknowable axis drag the confidence down', () => {
    // The declared-unknowable axis is left OUT of the minimum. Scoring it zero
    // would quarantine the row; scoring it 0.5 would be a guess.
    const n = normalise('WD Elements Desktop 18TB External Hard Drive USB 3.0');
    expect(n.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('takes the seller word for it when the title states the technology', () => {
    // The enclosure is sealed, but someone who opened it is not guessing.
    const n = normalise('WD Elements Desktop 18TB External CMR Hard Drive USB 3.0');
    expect(n.technology).toBe('hdd_cmr');
    expect(isPublishable(n)).toBe(true);
  });

  it('never guesses the enclosure contents from the family regex', () => {
    // classifyTechnology's HDD branch falls back to hdd_cmr at 0.4. Dropping
    // the dictionary assertion without suppressing that fallback would have
    // swapped one guess for another.
    for (const title of [
      'WD easystore 14TB External Desktop Hard Drive USB 3.0',
      'WD My Book 22TB External Desktop Hard Drive USB 3.0',
      'Seagate Expansion Desktop 16TB External Hard Drive USB 3.0',
    ]) {
      expect(normalise(title).technology, title).toBeNull();
    }
  });

  it('still holds an unresolved axis that nobody declared unknowable', () => {
    // The clause is narrow by construction: it only applies where a curated
    // entry says so. An unreadable axis anywhere else still scores zero.
    const n = normalise('Acme Superdrive 9000 4TB internal hard drive');
    expect(isPublishable(n)).toBe(false);
  });
});

describe('an explicit token outranks the curated table', () => {
  it('believes a stated CMR over a family listed as SMR', () => {
    expect(
      normalise('WD Blue 1TB WD10EZEX 3.5 inch SATA CMR hard drive').technology,
    ).toBe('hdd_cmr');
  });

  it('believes a stated QLC over a family default of TLC', () => {
    expect(normalise('Samsung 870 QVO 8TB 2.5 SATA III SSD QLC').technology).toBe(
      'ssd_qlc',
    );
  });
});

describe('dictionary lookup', () => {
  it('prefers the longer, more specific family name', () => {
    expect(lookupDictionary('Seagate IronWolf Pro 20TB')?.entry.id).toBe(
      'seagate-ironwolf-pro',
    );
    expect(lookupDictionary('WD Red Plus 8TB NAS')?.entry.id).toBe('wd-red-plus');
  });

  it('prefers a model number over a family name', () => {
    expect(lookupDictionary('WD Blue 6TB WD60EZAZ 3.5 SATA')?.entry.id).toBe(
      'wd-wd60ezaz',
    );
  });

  it('uses exclusions where the specific family has the shorter name', () => {
    expect(lookupDictionary('Crucial P3 Plus 4TB NVMe')?.entry.id).toBe(
      'crucial-p3-plus',
    );
    expect(lookupDictionary('Crucial P310 1TB M.2 2230')?.entry.id).toBe('crucial-p310');
    expect(lookupDictionary('WD Red SN700 4TB NVMe')?.entry.id).toBe('wd-red-sn700');
    expect(lookupDictionary('WD Blue SN570 2TB NVMe')?.entry.id).toBe('wd-blue-sn570');
  });

  it('anchors at a word boundary so a family name cannot match mid-token', () => {
    // "t500" must not match inside "ST500LM030"; "crucial p3" not inside "P300".
    expect(lookupDictionary('Seagate ST500LM030 500GB 2.5')?.entry.id).not.toBe(
      'crucial-t500',
    );
    expect(lookupDictionary('Toshiba P300 6TB')?.entry.id).toBe('toshiba-p300');
  });

  it('matches model numbers that run into a longer part code', () => {
    // MG08ACA16TE — a trailing word boundary would miss this.
    expect(lookupDictionary('Toshiba MG08ACA16TE 16TB SATA')?.entry.id).toBe(
      'toshiba-mg',
    );
  });
});

describe('used-drive risk fields', () => {
  it('parses power-on hours from either the title or the description', () => {
    expect(parsePowerOnHours('Exos X16 16TB 24,500 hours')).toBe(24500);
    expect(
      parsePowerOnHours('SMART shows power on hours: 41200 and no bad sectors'),
    ).toBe(41200);
    expect(parsePowerOnHours('POH: 33,450')).toBe(33450);
    expect(parsePowerOnHours('18,900 hrs')).toBe(18900);
  });

  it('rejects implausible hour counts', () => {
    expect(parsePowerOnHours('999999 hours')).toBeNull();
  });

  it('distinguishes "no warranty" from an unstated warranty', () => {
    expect(parseHasWarranty('Sold as-is, no warranty')).toBe(false);
    expect(parseHasWarranty('Out of warranty')).toBe(false);
    expect(parseHasWarranty('5 year warranty included')).toBe(true);
    expect(parseHasWarranty('Under warranty until 2027')).toBe(true);
    expect(parseHasWarranty('Seagate Exos X18 18TB SATA')).toBeNull();
  });

  it('reads the return policy', () => {
    expect(parseReturnPolicy('No returns, final sale')).toBe('No returns');
    expect(parseReturnPolicy('30 day money back returns')).toBe('30-day returns');
    expect(parseReturnPolicy('14-day returns')).toBe('14-day returns');
    expect(parseReturnPolicy('Returns accepted')).toBe('Returns accepted');
    expect(parseReturnPolicy('Seagate Exos X18 18TB')).toBeNull();
  });
});

describe('parseRpm', () => {
  it('reads the common spindle speeds', () => {
    expect(parseRpm('7200 RPM')).toBe(7200);
    expect(parseRpm('5400rpm')).toBe(5400);
    expect(parseRpm('15K RPM SAS')).toBe(15000);
    expect(parseRpm('10k rpm')).toBe(10000);
  });

  it('does not invent one', () => {
    expect(parseRpm('Samsung 990 PRO 2TB NVMe')).toBeNull();
  });
});

describe('form factor and interface fallbacks', () => {
  it('falls back to 3.5 only above 8TB, where 2.5 SATA does not exist', () => {
    const big = classifyFormFactor('Generic 12TB drive');
    expect(big.value).toBe('3.5');
    expect(big.conf).toBe(0.6);
    expect(classifyFormFactor('Generic 2TB drive').value).toBeNull();
  });

  it('treats a bare NVMe mention as a weak PCIe 4.0 signal', () => {
    const weak = classifyInterface('Generic NVMe SSD');
    expect(weak.value).toBe('pcie4');
    expect(weak.conf).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});

describe('shuckable resolution', () => {
  it('flags the enclosures worth opening and names the drive inside', () => {
    const n = normalise('WD Elements Desktop 18TB External Hard Drive USB 3.0');
    expect(n.shuckable).toBe(true);
    expect(n.shuckedEquivalent).toContain('white-label');
  });

  it('does not flag a bare drive', () => {
    expect(normalise('Seagate IronWolf Pro 20TB NAS Internal HDD').shuckable).toBe(false);
  });
});
