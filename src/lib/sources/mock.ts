import type { Condition, Marketplace } from '../taxonomy';
import { SEARCH_KEYWORDS, type RawListing, type SourceAdapter } from './types';

/**
 * The mock adapter.
 *
 * The site must be fully buildable and demoable before any credential exists,
 * and `MOCK_DATA=true` is the default for local dev and CI (CLAUDE.md §5).
 *
 * The titles here are written in the messy style real listings use — mixed
 * casing, model numbers dropped mid-string, cache and RPM figures adjacent to
 * the capacity, lot notations in all four forms. Feeding normalize.ts clean
 * input would make the whole exercise worthless: the point is that the
 * correctness layer is genuinely exercised before it ever sees live data.
 */

/** Deterministic PRNG (mulberry32), so the demo is stable between runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Family {
  brand: string;
  name: string;
  /** Capacities offered, in decimal TB. */
  capacities: number[];
  /** Plausible new-condition price per TB, in dollars. */
  baselinePerTb: number;
  kind: 'hdd' | 'ssd' | 'external';
  /** Enterprise families dominate the used market — datacentre pulls. */
  enterprise?: boolean;
  /** Extra tokens sellers put in titles for this family. */
  tokens: string;
}

/**
 * ~50 real drive families, matching the spec dictionary so the dictionary path
 * is exercised, with a handful that deliberately miss it so the regex fallback
 * and the quarantine path are exercised too.
 */
const FAMILIES: Family[] = [
  {
    brand: 'Seagate',
    name: 'IronWolf Pro',
    capacities: [4, 8, 12, 16, 18, 20, 22, 24],
    baselinePerTb: 19,
    kind: 'hdd',
    tokens: 'NAS Internal HDD CMR 3.5" SATA 6Gb/s 7200 RPM 256MB Cache',
  },
  {
    brand: 'Seagate',
    name: 'IronWolf',
    capacities: [2, 4, 6, 8, 12],
    baselinePerTb: 21,
    kind: 'hdd',
    tokens: 'NAS Hard Drive 3.5 inch SATA 5900RPM 64MB',
  },
  {
    brand: 'Seagate',
    name: 'Exos X16',
    capacities: [10, 12, 14, 16],
    baselinePerTb: 12,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 7200RPM 3.5" 512e Enterprise Hard Drive',
  },
  {
    brand: 'Seagate',
    name: 'Exos X18',
    capacities: [14, 16, 18],
    baselinePerTb: 12.5,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SAS 12Gb/s 3.5in 7200 RPM Enterprise HDD',
  },
  {
    brand: 'Seagate',
    name: 'Exos X20',
    capacities: [18, 20],
    baselinePerTb: 13,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 3.5 inch 7200RPM Enterprise Class',
  },
  {
    brand: 'Seagate',
    name: 'Exos X22',
    capacities: [20, 22],
    baselinePerTb: 14,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 7200 RPM 3.5" 512MB Cache Enterprise',
  },
  {
    brand: 'Seagate',
    name: 'Exos X24',
    capacities: [20, 24],
    baselinePerTb: 15,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SAS 12Gb/s 7200RPM 3.5 inch Enterprise Hard Drive',
  },
  {
    brand: 'Seagate',
    name: 'Exos 7E8',
    capacities: [4, 6, 8],
    baselinePerTb: 13,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 7200RPM 3.5 Enterprise ST8000NM000A',
  },
  {
    brand: 'Seagate',
    name: 'SkyHawk',
    capacities: [4, 6, 8, 10],
    baselinePerTb: 17,
    kind: 'hdd',
    tokens: 'Surveillance Hard Drive 3.5" SATA 7200RPM',
  },
  {
    brand: 'Seagate',
    name: 'SkyHawk AI',
    capacities: [12, 16, 18],
    baselinePerTb: 19,
    kind: 'hdd',
    tokens: 'Video Surveillance HDD 7200 RPM SATA 3.5 inch',
  },
  {
    brand: 'Seagate',
    name: 'BarraCuda',
    capacities: [2, 4, 6, 8],
    baselinePerTb: 16,
    kind: 'hdd',
    tokens: 'Desktop Hard Drive 3.5 Inch SATA 5400 RPM 256MB Cache SMR',
  },
  {
    brand: 'Seagate',
    name: 'BarraCuda Pro',
    capacities: [4, 6, 8, 10],
    baselinePerTb: 22,
    kind: 'hdd',
    tokens: '7200RPM 3.5 inch SATA 128MB Cache Hard Drive',
  },
  {
    brand: 'Seagate',
    name: 'Constellation ES.3',
    capacities: [2, 3, 4],
    baselinePerTb: 11,
    kind: 'hdd',
    enterprise: true,
    tokens: '7200RPM SAS 6Gb/s 3.5" Enterprise',
  },
  {
    brand: 'Western Digital',
    name: 'WD Red Plus',
    capacities: [4, 6, 8, 10, 12, 14],
    baselinePerTb: 20,
    kind: 'hdd',
    tokens: 'NAS Hard Drive 3.5" SATA 5640 RPM 256MB Cache CMR',
  },
  {
    brand: 'Western Digital',
    name: 'WD Red Pro',
    capacities: [8, 12, 16, 18, 20, 22],
    baselinePerTb: 21,
    kind: 'hdd',
    tokens: 'NAS HDD 7200 RPM SATA 6Gb/s 3.5-inch',
  },
  {
    brand: 'Western Digital',
    name: 'WD Gold',
    capacities: [8, 12, 16, 18, 22],
    baselinePerTb: 20,
    kind: 'hdd',
    enterprise: true,
    tokens: 'Enterprise Class HDD 7200RPM SATA 3.5"',
  },
  {
    brand: 'Western Digital',
    name: 'WD Ultrastar DC HC550',
    capacities: [16, 18],
    baselinePerTb: 13,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 7200RPM 3.5" Data Center Hard Drive',
  },
  {
    brand: 'Western Digital',
    name: 'WD Ultrastar DC HC530',
    capacities: [14],
    baselinePerTb: 12.5,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SAS 12Gb/s 3.5 inch 7200RPM Enterprise',
  },
  {
    brand: 'Western Digital',
    name: 'WD Ultrastar DC HC570',
    capacities: [22],
    baselinePerTb: 14,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 3.5 inch 7200RPM Data Center HDD',
  },
  {
    brand: 'HGST',
    name: 'Ultrastar He10',
    capacities: [8, 10],
    baselinePerTb: 10,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SAS 12Gb/s 7200RPM 3.5 HUH721010AL4200',
  },
  {
    brand: 'HGST',
    name: 'Ultrastar He12',
    capacities: [12],
    baselinePerTb: 10.5,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 7200RPM 3.5 inch CMR',
  },
  {
    brand: 'HGST',
    name: 'Ultrastar He8',
    capacities: [8],
    baselinePerTb: 9.5,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SAS Hard Drive 3.5 inch 7200RPM Tested',
  },
  {
    brand: 'Western Digital',
    name: 'WD Purple',
    capacities: [4, 6, 8, 12],
    baselinePerTb: 18,
    kind: 'hdd',
    tokens: 'Surveillance Hard Drive 3.5" SATA 6Gb/s',
  },
  {
    brand: 'Western Digital',
    name: 'WD Blue',
    capacities: [1, 2, 4],
    baselinePerTb: 24,
    kind: 'hdd',
    tokens: 'Desktop Hard Drive 3.5 inch SATA 6Gb/s 5400RPM',
  },
  {
    brand: 'Western Digital',
    name: 'WD80EAZZ',
    capacities: [8],
    baselinePerTb: 17,
    kind: 'hdd',
    tokens: 'WD Blue 3.5" SATA 5640RPM CMR Desktop Hard Drive',
  },
  {
    brand: 'Toshiba',
    name: 'MG08ACA16TE',
    capacities: [16],
    baselinePerTb: 13,
    kind: 'hdd',
    enterprise: true,
    tokens: '7200RPM SATA 6Gb/s 3.5" Enterprise Hard Drive',
  },
  {
    brand: 'Toshiba',
    name: 'MG09ACA18TE',
    capacities: [18],
    baselinePerTb: 13.5,
    kind: 'hdd',
    enterprise: true,
    tokens: 'SATA 512e 7200 RPM 3.5 inch Enterprise HDD',
  },
  {
    brand: 'Toshiba',
    name: 'MN08ACA14T',
    capacities: [14],
    baselinePerTb: 17,
    kind: 'hdd',
    tokens: 'NAS Hard Drive 7200RPM SATA 6.0Gb/s 3.5"',
  },
  {
    brand: 'Toshiba',
    name: 'N300',
    capacities: [4, 8, 12, 16],
    baselinePerTb: 18,
    kind: 'hdd',
    tokens: 'NAS Internal Hard Drive 7200 RPM SATA 3.5 Inch',
  },
  {
    brand: 'Toshiba',
    name: 'X300',
    capacities: [4, 8, 10],
    baselinePerTb: 19,
    kind: 'hdd',
    tokens: 'Performance Internal Hard Drive 7200RPM SATA 3.5"',
  },
  {
    brand: 'Samsung',
    name: '990 PRO',
    capacities: [1, 2, 4],
    baselinePerTb: 78,
    kind: 'ssd',
    tokens: 'PCIe 4.0 NVMe M.2 2280 Internal SSD 7450 MB/s',
  },
  {
    brand: 'Samsung',
    name: '990 EVO Plus',
    capacities: [1, 2, 4],
    baselinePerTb: 62,
    kind: 'ssd',
    tokens: 'M.2 2280 NVMe SSD PCIe 4.0 Internal Solid State',
  },
  {
    brand: 'Samsung',
    name: '980 PRO',
    capacities: [1, 2],
    baselinePerTb: 72,
    kind: 'ssd',
    tokens: 'PCIe Gen4 NVMe M.2 2280 SSD MZ-V8P1T0B',
  },
  {
    brand: 'Samsung',
    name: '970 EVO Plus',
    capacities: [1, 2],
    baselinePerTb: 68,
    kind: 'ssd',
    tokens: 'NVMe M.2 2280 PCIe 3.0 x4 Internal SSD',
  },
  {
    brand: 'Samsung',
    name: '9100 PRO',
    capacities: [1, 2, 4],
    baselinePerTb: 95,
    kind: 'ssd',
    tokens: 'PCIe 5.0 NVMe M.2 2280 SSD Gen5 x4 14800MB/s',
  },
  {
    brand: 'Western Digital',
    name: 'WD_BLACK SN850X',
    capacities: [1, 2, 4, 8],
    baselinePerTb: 74,
    kind: 'ssd',
    tokens: 'NVMe M.2 2280 SSD PCIe Gen4 x4 7300MB/s Gaming',
  },
  {
    brand: 'Western Digital',
    name: 'WD_BLACK SN770M',
    capacities: [1, 2],
    baselinePerTb: 88,
    kind: 'ssd',
    tokens: 'M.2 2230 NVMe SSD for Steam Deck PCIe Gen4',
  },
  {
    brand: 'Western Digital',
    name: 'WD Blue SN580',
    capacities: [1, 2],
    baselinePerTb: 52,
    kind: 'ssd',
    tokens: 'NVMe M.2 2280 PCIe Gen4 Internal SSD',
  },
  {
    brand: 'Western Digital',
    name: 'WD Red SN700',
    capacities: [1, 2, 4],
    baselinePerTb: 82,
    kind: 'ssd',
    tokens: 'NVMe M.2 2280 SSD for NAS PCIe Gen3',
  },
  {
    brand: 'Crucial',
    name: 'T705',
    capacities: [1, 2, 4],
    baselinePerTb: 105,
    kind: 'ssd',
    tokens: 'PCIe Gen5 NVMe M.2 2280 SSD 14500MB/s with Heatsink',
  },
  {
    brand: 'Crucial',
    name: 'T500',
    capacities: [1, 2, 4],
    baselinePerTb: 66,
    kind: 'ssd',
    tokens: 'PCIe Gen4 NVMe M.2 2280 Internal SSD',
  },
  {
    brand: 'Crucial',
    name: 'P3 Plus',
    capacities: [1, 2, 4],
    baselinePerTb: 48,
    kind: 'ssd',
    tokens: 'PCIe Gen4 NVMe M.2 2280 SSD 5000MB/s QLC',
  },
  {
    brand: 'Crucial',
    name: 'MX500',
    capacities: [1, 2, 4],
    baselinePerTb: 58,
    kind: 'ssd',
    tokens: '3D NAND SATA 2.5 Inch Internal SSD 560MB/s',
  },
  {
    brand: 'Crucial',
    name: 'P310',
    capacities: [1, 2],
    baselinePerTb: 70,
    kind: 'ssd',
    tokens: 'M.2 2230 PCIe Gen4 NVMe SSD for Steam Deck Handheld',
  },
  {
    brand: 'SK hynix',
    name: 'Platinum P41',
    capacities: [1, 2],
    baselinePerTb: 76,
    kind: 'ssd',
    tokens: 'PCIe NVMe Gen4 M.2 2280 SSD 7000MB/s',
  },
  {
    brand: 'Samsung',
    name: '870 EVO',
    capacities: [1, 2, 4],
    baselinePerTb: 60,
    kind: 'ssd',
    tokens: '2.5" SATA III Internal SSD MZ-77E4T0B/AM',
  },
  {
    brand: 'Samsung',
    name: '870 QVO',
    capacities: [2, 4, 8],
    baselinePerTb: 46,
    kind: 'ssd',
    tokens: '2.5 Inch SATA III Internal SSD QLC',
  },
  {
    brand: 'Samsung',
    name: 'PM9A3',
    capacities: [1.92, 3.84, 7.68],
    baselinePerTb: 62,
    kind: 'ssd',
    enterprise: true,
    tokens: 'U.2 NVMe PCIe 4.0 Enterprise SSD 1 DWPD',
  },
  {
    brand: 'Micron',
    name: '7450 PRO',
    capacities: [1.92, 3.84, 7.68],
    baselinePerTb: 58,
    kind: 'ssd',
    enterprise: true,
    tokens: 'U.3 NVMe PCIe 4.0 Enterprise SSD',
  },
  {
    brand: 'Solidigm',
    name: 'D7-P5520',
    capacities: [3.84, 7.68],
    baselinePerTb: 55,
    kind: 'ssd',
    enterprise: true,
    tokens: 'U.2 NVMe PCIe Gen4 Data Center SSD',
  },
  {
    brand: 'Samsung',
    name: 'PM893',
    capacities: [1.92, 3.84],
    baselinePerTb: 44,
    kind: 'ssd',
    enterprise: true,
    tokens: 'SATA 6Gb/s 2.5" Enterprise SSD',
  },
  {
    brand: 'Kingston',
    name: 'KC3000',
    capacities: [1, 2, 4],
    baselinePerTb: 64,
    kind: 'ssd',
    tokens: 'PCIe 4.0 NVMe M.2 2280 SSD 7000MB/s',
  },
  {
    brand: 'Samsung',
    name: 'T7 Shield',
    capacities: [1, 2, 4],
    baselinePerTb: 84,
    kind: 'external',
    tokens: 'Portable SSD USB 3.2 Gen 2 IP65 Rugged',
  },
  {
    brand: 'Samsung',
    name: 'T9',
    capacities: [1, 2, 4],
    baselinePerTb: 105,
    kind: 'external',
    tokens: 'Portable SSD USB 3.2 Gen 2x2 20Gbps External',
  },
  {
    brand: 'Western Digital',
    name: 'WD Elements Desktop',
    capacities: [8, 12, 14, 16, 18, 20, 22],
    baselinePerTb: 14,
    kind: 'external',
    tokens: 'External Hard Drive USB 3.0',
  },
  {
    brand: 'Western Digital',
    name: 'WD easystore',
    capacities: [8, 12, 14, 16, 18],
    baselinePerTb: 13.5,
    kind: 'external',
    tokens: 'External Desktop Hard Drive USB 3.0',
  },
  {
    brand: 'Western Digital',
    name: 'WD My Passport',
    capacities: [1, 2, 4, 5],
    baselinePerTb: 30,
    kind: 'external',
    tokens: 'Portable External Hard Drive USB 3.0 Slim',
  },
  {
    brand: 'Seagate',
    name: 'Seagate Expansion Desktop',
    capacities: [8, 12, 16, 18, 20],
    baselinePerTb: 14,
    kind: 'external',
    tokens: 'External Hard Drive USB 3.0',
  },
  {
    brand: 'Seagate',
    name: 'Seagate One Touch',
    capacities: [1, 2, 4, 5],
    baselinePerTb: 28,
    kind: 'external',
    tokens: 'Portable External Hard Drive USB 3.0',
  },
];

/** Accessories and out-of-catalogue media that share the eBay categories. */
const NON_PRODUCTS: string[] = [
  'SATA Cable 6Gb/s 18 inch Straight to Right Angle',
  'Orico 3.5" USB 3.0 Hard Drive Enclosure Tool Free',
  'Sabrent USB 3.0 to SATA External Hard Drive Docking Station for 2.5 3.5 HDD SSD',
  '2.5 inch SATA Hard Drive Caddy Tray for Dell PowerEdge R720 R730 Server',
  'StarTech 3.5 to 2.5 Hard Drive Mounting Bracket Adapter Kit with Screws',
  'LSI 9300-8i 12Gb/s SAS HBA Controller Card IT Mode for ZFS TrueNAS',
  'SanDisk Extreme PRO 1TB microSDXC UHS-I Memory Card',
  'HP LTO-8 Ultrium 30TB RW Data Tape Cartridge Q2078A',
  'Icy Dock 4 Bay 3.5 SATA Hard Drive Backplane Cage for 5.25 Bay',
  'Samsung BAR Plus 256GB USB 3.1 Flash Drive Metal Thumb Drive',
];

const SELLERS: string[] = [
  'serverpartdeals',
  'goharddrive',
  'disctech',
  'techsupplydirect',
  'newlifeit',
  'pcserverandparts',
  'itcreations',
  'orangecomputers',
];

/** Formats a capacity the way listings write it: "20TB", "7.68TB", "960GB". */
function capacityToken(tb: number): string {
  return tb < 1 ? `${Math.round(tb * 1000)}GB` : `${tb}TB`;
}

function pick<T>(rng: () => number, xs: readonly T[]): T {
  // xs is never empty at any call site; the assertion keeps the signature clean.
  return xs[Math.floor(rng() * xs.length)] as T;
}

/** Multiplier applied to the new-condition price. */
const CONDITION_DISCOUNT: Record<Condition, number> = {
  new: 1,
  renewed: 0.72,
  used: 0.55,
};

function generate(seed: number, count: number): RawListing[] {
  const rng = mulberry32(seed);
  const out: RawListing[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < count; i++) {
    const family = pick(rng, FAMILIES);
    const capacity = pick(rng, family.capacities);

    // Used stock skews heavily to enterprise families — datacentre pulls are
    // where the lowest $/TB on the market actually sits.
    const conditionRoll = rng();
    const condition: Condition = family.enterprise
      ? conditionRoll < 0.5
        ? 'used'
        : conditionRoll < 0.7
          ? 'renewed'
          : 'new'
      : conditionRoll < 0.12
        ? 'used'
        : conditionRoll < 0.22
          ? 'renewed'
          : 'new';

    // Real multi-drive lots, so the lot-detection path is genuinely exercised.
    // Bare enterprise drives are what actually gets sold in lots; externals
    // almost never are, which is why `kind` matters here.
    const lotRoll = rng();
    const lotSize =
      family.enterprise && family.kind !== 'external' && lotRoll < 0.22
        ? pick(rng, [2, 3, 4, 5, 6, 8, 10, 12])
        : 1;

    // Jitter around a plausible per-TB baseline.
    const jitter = 0.82 + rng() * 0.42;
    const perTb = family.baselinePerTb * CONDITION_DISCOUNT[condition] * jitter;
    const priceCents = Math.round(perTb * capacity * lotSize * 100);

    // eBay carries the used and lot market; Amazon skews new and single.
    const marketplace: Marketplace =
      condition === 'new' && lotSize === 1 ? (rng() < 0.55 ? 'amazon' : 'ebay') : 'ebay';

    const shippingRoll = rng();
    const shippingIsCalculated = marketplace === 'ebay' && shippingRoll < 0.12;
    const shippingCents =
      marketplace === 'amazon' || shippingIsCalculated || shippingRoll > 0.45
        ? 0
        : Math.round((4 + rng() * 24) * 100);

    const cap = capacityToken(capacity);
    const lotPrefix =
      lotSize === 1
        ? ''
        : pick(rng, [
            `Lot of ${lotSize} `,
            `${lotSize} x ${cap} `,
            `${lotSize}-pack `,
            `Qty ${lotSize} `,
          ]);

    // Titles are assembled messily on purpose.
    const suffixRoll = rng();
    const suffix =
      condition === 'used' && suffixRoll < 0.55
        ? ` ${Math.round(8000 + rng() * 45000).toLocaleString('en-US')} hours`
        : suffixRoll < 0.7
          ? ' Tested'
          : '';

    const titleCore = lotPrefix.includes(cap)
      ? `${lotPrefix}${family.brand} ${family.name} ${family.tokens}`
      : `${lotPrefix}${family.brand} ${family.name} ${cap} ${family.tokens}`;

    const title = `${titleCore}${suffix}`.replace(/\s+/g, ' ').trim();

    const externalId =
      marketplace === 'amazon'
        ? `B0${Math.floor(rng() * 1e8)
            .toString(36)
            .toUpperCase()
            .padStart(8, '0')
            .slice(0, 8)}`
        : `${Math.floor(100000000000 + rng() * 899999999999)}`;
    if (usedIds.has(externalId)) {
      i--; // Collision: retry rather than silently shrinking the catalogue.
      continue;
    }
    usedIds.add(externalId);

    const sellerName = marketplace === 'ebay' ? pick(rng, SELLERS) : undefined;
    const sellerScore = marketplace === 'ebay' ? 98.5 + rng() * 1.5 : undefined;

    const descriptionParts: string[] = [];
    if (condition !== 'new') {
      if (rng() < 0.5) {
        descriptionParts.push(
          `Power on hours: ${Math.round(6000 + rng() * 50000).toLocaleString('en-US')}.`,
        );
      }
      descriptionParts.push(
        rng() < 0.4 ? 'Sold as-is, no warranty.' : '2 year warranty.',
      );
      descriptionParts.push(
        rng() < 0.3 ? 'No returns, final sale.' : '30 day money back returns.',
      );
    }

    out.push({
      marketplace,
      externalId,
      title,
      description: descriptionParts.join(' '),
      condition,
      priceCents,
      shippingCents,
      shippingIsCalculated,
      currency: 'USD',
      locale: 'en-US',
      // A realistic share of listings are out of stock.
      inStock: rng() > 0.08,
      sellerName,
      sellerScore,
      url:
        marketplace === 'amazon'
          ? `https://www.amazon.com/dp/${externalId}`
          : `https://www.ebay.com/itm/${externalId}`,
    });
  }

  // Accessories the category filter should have excluded but sometimes does
  // not. These must be rejected by normalisation, not ranked.
  NON_PRODUCTS.forEach((title, i) => {
    out.push({
      marketplace: 'ebay',
      externalId: `9${(700000000000 + i).toString()}`,
      title,
      description: '',
      condition: 'new',
      priceCents: 999 + i * 250,
      shippingCents: 0,
      shippingIsCalculated: false,
      currency: 'USD',
      locale: 'en-US',
      inStock: true,
      sellerName: 'accessorydepot',
      sellerScore: 99.1,
      url: `https://www.ebay.com/itm/9${700000000000 + i}`,
    });
  });

  return out;
}

const SEED = 0x9e3779b9;
const TARGET_LISTINGS = 400;

let cache: RawListing[] | null = null;

function allListings(): RawListing[] {
  cache ??= generate(SEED, TARGET_LISTINGS);
  return cache;
}

/** Test seam: forget the generated catalogue so a new seed takes effect. */
export function resetMockCatalogue(): void {
  cache = null;
}

export function mockListings(): RawListing[] {
  return allListings();
}

/**
 * Splits the catalogue across the keyword sweep deterministically, so each
 * keyword returns a stable slice and the ingest job sees the same shape it
 * would against a live API.
 */
export function createMockAdapter(
  marketplace: Marketplace,
  options: { enabled?: boolean; ttlHours?: number } = {},
): SourceAdapter {
  const { enabled = true, ttlHours = marketplace === 'amazon' ? 24 : 6 } = options;

  return {
    marketplace,
    enabled,
    ttlHours,
    search(keyword: string): Promise<RawListing[]> {
      const mine = allListings().filter((l) => l.marketplace === marketplace);

      // Slices must be stable, disjoint AND exhaustive: keyed off a hash, two
      // keywords can collide onto the same residue and part of the catalogue is
      // then never returned by any keyword. Using the keyword's position in the
      // sweep guarantees the union is the whole catalogue exactly once.
      const index = SEARCH_KEYWORDS.indexOf(keyword);
      const buckets = SEARCH_KEYWORDS.length;
      const bucket =
        index >= 0
          ? index
          : [...keyword].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % buckets;

      return Promise.resolve(mine.filter((_, i) => i % buckets === bucket));
    },
  };
}
