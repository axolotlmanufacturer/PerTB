import { EMPTY_QUERY, type Query } from './query';

/**
 * The curated landing routes.
 *
 * HAND-WRITTEN, EVERY ONE. Do not generate a capacity × technology × interface
 * matrix from this file, and do not add a route just because a combination
 * exists. Thin generated pages get classed as doorway spam, and that
 * classification is applied to the whole domain, not the offending URLs — it
 * would take the table down with it.
 *
 * The test for a route earning its place: it answers a question a real person
 * types into a search box, and it returns a genuinely different result set
 * from every other route here. Capped at 40.
 */

export type LandingCategory = 'hdd' | 'ssd';

export interface Landing {
  category: LandingCategory;
  slug: string;
  /** <title>. Written for the SERP, not for the page. */
  title: string;
  /** Meta description. */
  description: string;
  /** Shown above the table. One paragraph, no marketing voice. */
  intro: string;
  /** Breadcrumb leaf and cross-link label. */
  label: string;
  /** The filter set. Merged over the defaults; user params override per key. */
  filters: Partial<Query>;
  /** Slugs of related landings, for the cross-link block (ticket 4.5). */
  related: string[];
}

const HDD_ALL = ['hdd_cmr', 'hdd_smr', 'sshd'] as const;
const SSD_ALL = ['ssd_tlc', 'ssd_qlc', 'ssd_mlc'] as const;

export const LANDINGS: Landing[] = [
  // ── HDD: use case ────────────────────────────────────────────────────────
  {
    category: 'hdd',
    slug: 'nas',
    label: 'NAS drives',
    title: 'Cheapest NAS Hard Drives by Price per TB',
    description:
      'Every CMR 3.5-inch NAS hard drive from 4TB up, ranked by cost per terabyte with shipping included. SMR drives excluded.',
    intro:
      'CMR 3.5-inch drives from 4TB up. SMR is filtered out deliberately: shingled drives can take days to finish a RAID rebuild and some controllers drop them mid-resilver, which is how a degraded array becomes a lost one.',
    filters: { technology: ['hdd_cmr'], formFactor: ['3.5'], capMin: 4 },
    related: ['used-enterprise', 'shuckable', 'cmr', '16tb'],
  },
  {
    category: 'hdd',
    slug: 'surveillance',
    label: 'Surveillance drives',
    title: 'Surveillance Hard Drives by Price per TB',
    description:
      'Drives rated for continuous write workloads — SkyHawk, WD Purple, Toshiba S300 — ranked by cost per terabyte.',
    intro:
      'Drives built for continuous sequential writes from many camera streams at once. Desktop drives will do this job until they do not; surveillance firmware trades some error-recovery time for sustained write reliability.',
    filters: { technology: ['hdd_cmr'], formFactor: ['3.5'], capMin: 2 },
    related: ['nas', 'homelab', '8tb', 'cmr'],
  },
  {
    category: 'hdd',
    slug: 'homelab',
    label: 'Homelab bulk storage',
    title: 'Cheapest Bulk Storage for a Homelab, by Price per TB',
    description:
      'Large-capacity 3.5-inch drives from 8TB up, new and used, ranked by cost per terabyte with shipping folded in.',
    intro:
      'Bulk capacity from 8TB up, including used enterprise pulls. This is usually the cheapest honest $/TB on the market — the trade is power-on hours and no warranty, both shown per row.',
    filters: { formFactor: ['3.5'], capMin: 8 },
    related: ['used-enterprise', 'sas', 'nas', '20tb'],
  },
  {
    category: 'hdd',
    slug: 'backup',
    label: 'Backup drives',
    title: 'Cheapest Backup Drives by Price per TB',
    description:
      'External and internal drives for cold backup, ranked by cost per terabyte. Capacity per dollar over speed.',
    intro:
      'Cold backup is the one workload where SMR is genuinely fine: writes are sequential and bulk, reads are rare. That widens the field considerably and lowers the floor.',
    filters: { technology: ['hdd_cmr', 'hdd_smr'], capMin: 4 },
    related: ['external', 'shuckable', 'smr', '8tb'],
  },

  // ── HDD: condition ───────────────────────────────────────────────────────
  {
    category: 'hdd',
    slug: 'used-enterprise',
    label: 'Used enterprise',
    title: 'Used Enterprise Hard Drives by Price per TB',
    description:
      'Datacentre pulls from 8TB up — Exos, Ultrastar, MG series — with power-on hours and return policy shown per listing.',
    intro:
      'Datacentre pulls, where the genuinely lowest $/TB on the market sits. Every row shows power-on hours, warranty status and the return policy, because $4/TB on a drive with 45,000 hours and no returns is a different proposition from $4/TB on one with 8,000.',
    filters: { condition: ['used', 'renewed'], formFactor: ['3.5'], capMin: 8 },
    related: ['sas', 'homelab', 'recertified', '16tb'],
  },
  {
    category: 'hdd',
    slug: 'recertified',
    label: 'Recertified',
    title: 'Manufacturer Recertified Hard Drives by Price per TB',
    description:
      'Factory-recertified drives with warranty remaining, ranked by cost per terabyte.',
    intro:
      'Recertified drives have been returned, tested and re-warranted by the manufacturer. They usually carry a shorter warranty than new stock at a materially lower price, which often makes them the best risk-adjusted $/TB on the page.',
    filters: { condition: ['renewed'], capMin: 4 },
    related: ['used-enterprise', 'nas', 'homelab', '12tb'],
  },

  // ── HDD: interface and form ──────────────────────────────────────────────
  {
    category: 'hdd',
    slug: 'sas',
    label: 'SAS drives',
    title: 'SAS Hard Drives by Price per TB',
    description:
      'SAS 12Gb/s enterprise drives ranked by cost per terabyte. Requires an HBA — these will not run on a desktop SATA port.',
    intro:
      'SAS drives are consistently cheaper per terabyte than the same capacity in SATA, because they need an HBA in IT mode and most buyers do not have one. If you do, this is the cheapest page on the site.',
    filters: { interface: ['sas12'] },
    related: ['used-enterprise', 'homelab', '16tb', 'u2-enterprise'],
  },
  {
    category: 'hdd',
    slug: 'external',
    label: 'External drives',
    title: 'External Hard Drives by Price per TB',
    description:
      'Desktop and portable external drives ranked by cost per terabyte, shipping included.',
    intro:
      'Complete external units. Desktop enclosures are frequently cheaper per terabyte than the bare drive inside them — see the shuckable page for the ones worth opening.',
    filters: { formFactor: ['ext_desktop', 'ext_portable'] },
    related: ['shuckable', 'backup', 'portable', '8tb'],
  },
  {
    category: 'hdd',
    slug: 'shuckable',
    label: 'Shuckable externals',
    title: 'Shuckable External Drives: Cheaper per TB Than Bare',
    description:
      'External enclosures containing white-label CMR drives, ranked by cost per terabyte against the bare equivalent.',
    intro:
      'A WD Elements 20TB routinely costs less than the bare drive inside it, because external units are priced as consumer appliances and bare drives are priced as components. Shucking voids the warranty, and the drive inside varies by production run.',
    filters: { shuckable: true },
    related: ['external', 'nas', 'homelab', '20tb'],
  },
  {
    category: 'hdd',
    slug: '2-5-inch',
    label: '2.5-inch drives',
    title: '2.5-inch Hard Drives by Price per TB',
    description: 'Laptop and portable 2.5-inch hard drives ranked by cost per terabyte.',
    intro:
      'Small-form-factor spinning drives. Almost everything here above 1TB is SMR, and a 2.5-inch SATA drive has not shipped above 8TB, so the capacity ceiling is real rather than a filtering artefact.',
    filters: { formFactor: ['2.5'], technology: [...HDD_ALL] },
    related: ['backup', 'external', 'sata-2-5', '2tb'],
  },

  // ── HDD: recording technology ────────────────────────────────────────────
  {
    category: 'hdd',
    slug: 'cmr',
    label: 'CMR only',
    title: 'CMR Hard Drives by Price per TB',
    description:
      'Conventional magnetic recording drives only, ranked by cost per terabyte. Safe for RAID and ZFS.',
    intro:
      'Conventional recording, resolved from a curated family table rather than the listing title — manufacturers rarely state it. Anything we could not resolve confidently is quarantined rather than guessed at, so this list is shorter than the catalogue and defensible.',
    filters: { technology: ['hdd_cmr'] },
    related: ['nas', 'smr', 'used-enterprise', '18tb'],
  },
  {
    category: 'hdd',
    slug: 'smr',
    label: 'SMR drives',
    title: 'SMR Hard Drives by Price per TB',
    description:
      'Shingled magnetic recording drives ranked by cost per terabyte. Cheap per TB, unsuitable for RAID.',
    intro:
      'Shingled drives overlap tracks to gain density, which makes random rewrites very slow. They are genuinely fine for sequential bulk storage and cold backup, and genuinely dangerous in a RAID rebuild. Listed here so the choice is deliberate.',
    filters: { technology: ['hdd_smr'] },
    related: ['backup', 'cmr', 'external', '8tb'],
  },

  // ── HDD: capacity ────────────────────────────────────────────────────────
  {
    category: 'hdd',
    slug: '2tb',
    label: '2TB',
    title: '2TB Hard Drives by Price per TB',
    description:
      'Every in-stock 2TB hard drive across Amazon and eBay, ranked by cost per terabyte with shipping included.',
    intro:
      'At 2TB the $/TB is dominated by the fixed cost of the enclosure, motor and controller rather than the platters, so this is usually one of the worst-value capacities on the site. It is here because people search for it.',
    filters: { technology: [...HDD_ALL], capMin: 1.9, capMax: 2.1 },
    related: ['4tb', '8tb', '2-5-inch', 'backup'],
  },
  {
    category: 'hdd',
    slug: '4tb',
    label: '4TB',
    title: '4TB Hard Drives by Price per TB',
    description:
      'Every in-stock 4TB hard drive, new and used, ranked by cost per terabyte with shipping folded into the price.',
    intro:
      'The smallest capacity where $/TB starts to be competitive, and a common size for small NAS builds where four bays of 4TB is enough.',
    filters: { technology: [...HDD_ALL], capMin: 3.9, capMax: 4.1 },
    related: ['2tb', '8tb', 'nas', 'cmr'],
  },
  {
    category: 'hdd',
    slug: '8tb',
    label: '8TB',
    title: '8TB Hard Drives by Price per TB',
    description:
      'Every in-stock 8TB hard drive, including used enterprise pulls, ranked by cost per terabyte with shipping included.',
    intro:
      'The capacity where used enterprise stock becomes plentiful, and where the gap between new retail and a datacentre pull is widest.',
    filters: { technology: [...HDD_ALL], capMin: 7.9, capMax: 8.1 },
    related: ['12tb', '4tb', 'used-enterprise', 'nas'],
  },
  {
    category: 'hdd',
    slug: '10tb',
    label: '10TB',
    title: '10TB Hard Drives by Price per TB',
    description:
      'Every in-stock 10TB hard drive, mostly datacentre pulls, ranked by cost per terabyte with power-on hours shown.',
    intro:
      'An awkward capacity in retail and a very common one in used enterprise stock, which is where most of this page comes from.',
    filters: { technology: [...HDD_ALL], capMin: 9.9, capMax: 10.1 },
    related: ['8tb', '12tb', 'used-enterprise', 'sas'],
  },
  {
    category: 'hdd',
    slug: '12tb',
    label: '12TB',
    title: '12TB Hard Drives by Price per TB',
    description:
      'Every in-stock 12TB hard drive, new and recertified, ranked by cost per terabyte with shipping included.',
    intro:
      'Helium-filled drives start around here, which is why 12TB units often run cooler and quieter than the 8TB drives they replace.',
    filters: { technology: [...HDD_ALL], capMin: 11.9, capMax: 12.1 },
    related: ['10tb', '14tb', 'homelab', 'nas'],
  },
  {
    category: 'hdd',
    slug: '14tb',
    label: '14TB',
    title: '14TB Hard Drives by Price per TB',
    description:
      'Every in-stock 14TB hard drive, heavy on recertified and enterprise stock, ranked by cost per terabyte.',
    intro:
      'Heavily represented in recertified and datacentre-pull stock, which usually puts the floor on this page well below the 12TB one despite the extra capacity.',
    filters: { technology: [...HDD_ALL], capMin: 13.9, capMax: 14.1 },
    related: ['12tb', '16tb', 'recertified', 'used-enterprise'],
  },
  {
    category: 'hdd',
    slug: '16tb',
    label: '16TB',
    title: '16TB Hard Drives by Price per TB',
    description:
      'Every in-stock 16TB hard drive across Amazon and eBay, ranked by cost per terabyte with shipping included.',
    intro:
      'Often the sweet spot for a new NAS build: high enough that the per-drive overhead is amortised, common enough that supply keeps the price honest.',
    filters: { technology: [...HDD_ALL], capMin: 15.9, capMax: 16.1 },
    related: ['14tb', '18tb', 'nas', 'homelab'],
  },
  {
    category: 'hdd',
    slug: '18tb',
    label: '18TB',
    title: '18TB Hard Drives by Price per TB',
    description:
      'Every in-stock 18TB hard drive, often the cheapest new retail capacity per terabyte, ranked with shipping included.',
    intro:
      'Frequently the lowest $/TB of any new retail capacity, because it sits one step below the current flagship and is produced in volume.',
    filters: { technology: [...HDD_ALL], capMin: 17.9, capMax: 18.1 },
    related: ['16tb', '20tb', 'nas', 'cmr'],
  },
  {
    category: 'hdd',
    slug: '20tb',
    label: '20TB',
    title: '20TB Hard Drives by Price per TB',
    description:
      'Every in-stock 20TB hard drive, bare and shuckable external, ranked by cost per terabyte with shipping included.',
    intro:
      'The capacity where shucking is most often worth it: 20TB external desktop units are priced as consumer appliances and regularly undercut the bare drive.',
    filters: { technology: [...HDD_ALL], capMin: 19.9, capMax: 20.1 },
    related: ['18tb', '22tb', 'shuckable', 'homelab'],
  },
  {
    category: 'hdd',
    slug: '22tb',
    label: '22TB',
    title: '22TB Hard Drives by Price per TB',
    description:
      'Every in-stock 22TB hard drive across Amazon and eBay, ranked by cost per terabyte with shipping included.',
    intro:
      'Near the top of the retail range. Expect a premium per terabyte over 18TB — you are paying for density in a fixed number of bays.',
    filters: { technology: [...HDD_ALL], capMin: 21.9, capMax: 22.1 },
    related: ['20tb', '24tb', 'nas', 'homelab'],
  },
  {
    category: 'hdd',
    slug: '24tb',
    label: '24TB',
    title: '24TB Hard Drives by Price per TB',
    description:
      'Every in-stock 24TB hard drive, the largest capacity in general retail, ranked by cost per terabyte.',
    intro:
      'The largest capacity in general retail circulation. Worth it when bays or power are the constraint rather than money; rarely the cheapest $/TB.',
    filters: { technology: [...HDD_ALL], capMin: 23.9, capMax: 24.1 },
    related: ['22tb', '20tb', 'homelab', 'sas'],
  },

  // ── SSD: interface ───────────────────────────────────────────────────────
  {
    category: 'ssd',
    slug: 'nvme-gen5',
    label: 'PCIe 5.0 NVMe',
    title: 'PCIe 5.0 NVMe SSDs by Price per TB',
    description:
      'Gen 5 NVMe drives ranked by cost per terabyte. The fastest consumer storage, and the most expensive per TB.',
    intro:
      'Gen 5 drives read above 12,000 MB/s and cost accordingly. Almost nothing outside synthetic benchmarks and large sequential transfers notices the difference from Gen 4 — the $/TB gap usually does not repay itself.',
    filters: { interface: ['pcie5'] },
    related: ['nvme-gen4', 'gaming', '2tb', '4tb'],
  },
  {
    category: 'ssd',
    slug: 'nvme-gen4',
    label: 'PCIe 4.0 NVMe',
    title: 'PCIe 4.0 NVMe SSDs by Price per TB',
    description:
      'Gen 4 NVMe drives ranked by cost per terabyte. The value sweet spot for consumer NVMe.',
    intro:
      'Gen 4 is where consumer NVMe value sits: near-flagship real-world speed at a fraction of the Gen 5 premium, and universally supported by anything built in the last few years.',
    filters: { interface: ['pcie4'] },
    related: ['nvme-gen5', 'gaming', 'nas-ssd', '2tb'],
  },
  {
    category: 'ssd',
    slug: 'sata-2-5',
    label: '2.5-inch SATA SSD',
    title: '2.5-inch SATA SSDs by Price per TB',
    description:
      'SATA solid state drives in the 2.5-inch form factor, ranked by cost per terabyte.',
    intro:
      'SATA caps at about 550 MB/s regardless of the drive, which makes these the obvious choice for bulk flash, older machines and anything with no M.2 slot. Frequently cheaper per terabyte than NVMe.',
    filters: { formFactor: ['2.5'], technology: [...SSD_ALL] },
    related: ['qlc', 'tlc', '4tb-ssd', 'used-enterprise-ssd'],
  },

  // ── SSD: form factor ─────────────────────────────────────────────────────
  {
    category: 'ssd',
    slug: 'm2-2230',
    label: 'M.2 2230',
    title: 'M.2 2230 SSDs by Price per TB — Steam Deck and ROG Ally',
    description:
      'Short 2230 NVMe drives that fit handheld consoles and ultrabooks, ranked by cost per terabyte.',
    intro:
      'The 30mm form factor used by the Steam Deck, ROG Ally and Legion Go. A 2280 drive will not fit, and single-sided construction matters in these machines — check the listing before buying.',
    filters: { formFactor: ['m2_2230'] },
    related: ['handheld', 'nvme-gen4', '1tb', '2tb'],
  },
  {
    category: 'ssd',
    slug: 'u2-enterprise',
    label: 'U.2 / U.3',
    title: 'U.2 and U.3 Enterprise SSDs by Price per TB',
    description:
      'Datacentre NVMe in the 2.5-inch U.2/U.3 form factor, ranked by cost per terabyte.',
    intro:
      'Enterprise NVMe with power-loss protection and endurance ratings consumer drives do not carry, at the lowest $/TB in flash. Needs a U.2 backplane or an adapter, and the drives run hot.',
    filters: { formFactor: ['u2'] },
    related: ['used-enterprise-ssd', 'sas', 'nas-ssd', '8tb-ssd'],
  },
  {
    category: 'ssd',
    slug: 'portable',
    label: 'Portable SSDs',
    title: 'Portable SSDs by Price per TB',
    description:
      'External USB solid state drives ranked by cost per terabyte, shipping included.',
    intro:
      'Bus-powered external flash. Gen 2×2 units reach about 2,000 MB/s but only on a host with a matching port; on anything else they fall back to 10Gb/s and the premium is wasted.',
    filters: { formFactor: ['ext_portable'], technology: [...SSD_ALL] },
    related: ['sata-2-5', 'backup', '2tb', '4tb-ssd'],
  },

  // ── SSD: use case ────────────────────────────────────────────────────────
  {
    category: 'ssd',
    slug: 'gaming',
    label: 'Gaming SSDs',
    title: 'Best Value Gaming SSDs by Price per TB',
    description:
      'NVMe drives suited to a games library, ranked by cost per terabyte rather than headline sequential speed.',
    intro:
      'Game loading is dominated by random reads and decompression, not sequential throughput, so a mid-range Gen 4 drive loads within a second or two of a Gen 5 flagship. Capacity is what actually runs out.',
    filters: { interface: ['pcie4', 'pcie5'], technology: [...SSD_ALL], capMin: 1 },
    related: ['nvme-gen4', 'nvme-gen5', 'handheld', '4tb-ssd'],
  },
  {
    category: 'ssd',
    slug: 'handheld',
    label: 'Handheld consoles',
    title: 'Handheld Console SSD Upgrades by Price per TB',
    description:
      'Single-sided 2230 and 2242 NVMe drives for the Steam Deck, ROG Ally and Legion Go, by cost per terabyte.',
    intro:
      'Handhelds take a 30mm drive and have almost no clearance, so double-sided modules can foul the chassis. Power draw matters too: a hungry drive costs real battery life in a device this size.',
    filters: { formFactor: ['m2_2230'], technology: [...SSD_ALL] },
    related: ['m2-2230', 'gaming', '1tb', '2tb'],
  },
  {
    category: 'ssd',
    slug: 'nas-ssd',
    label: 'NAS SSDs',
    title: 'NAS SSDs by Price per TB',
    description:
      'SSDs rated for sustained NAS workloads and cache duty, ranked by cost per terabyte.',
    intro:
      'All-flash arrays and cache tiers need sustained write endurance, which is where consumer QLC drives fall over: their SLC cache fills and throughput collapses to well under a hard drive.',
    filters: { technology: ['ssd_tlc', 'ssd_mlc'], capMin: 1 },
    related: ['u2-enterprise', 'tlc', 'used-enterprise-ssd', 'sata-2-5'],
  },

  // ── SSD: NAND type ───────────────────────────────────────────────────────
  {
    category: 'ssd',
    slug: 'tlc',
    label: 'TLC only',
    title: 'TLC NAND SSDs by Price per TB',
    description:
      'Triple-level-cell SSDs only, ranked by cost per terabyte. Better sustained writes and endurance than QLC.',
    intro:
      'Three bits per cell: the mainstream choice, and the one that holds its write speed once the SLC cache is exhausted. Where a manufacturer does not commit to a NAND type, the listing is quarantined rather than assumed to be TLC.',
    filters: { technology: ['ssd_tlc'] },
    related: ['qlc', 'nas-ssd', 'nvme-gen4', 'gaming'],
  },
  {
    category: 'ssd',
    slug: 'qlc',
    label: 'QLC drives',
    title: 'QLC NAND SSDs by Price per TB',
    description:
      'Quad-level-cell SSDs ranked by cost per terabyte. The cheapest flash, with the write caveat stated.',
    intro:
      'Four bits per cell buys density and costs sustained write speed: once the SLC cache fills, throughput can drop below a hard drive. Fine for a read-heavy library, poor for anything that writes continuously.',
    filters: { technology: ['ssd_qlc'] },
    related: ['tlc', 'sata-2-5', '4tb-ssd', '8tb-ssd'],
  },

  // ── SSD: condition ───────────────────────────────────────────────────────
  {
    category: 'ssd',
    slug: 'used-enterprise-ssd',
    label: 'Used enterprise SSD',
    title: 'Used Enterprise SSDs by Price per TB',
    description:
      'Datacentre SSD pulls ranked by cost per terabyte, with power-on hours and warranty shown.',
    intro:
      'Enterprise SSDs are specified for several full drive writes per day for five years, so a pull with 20,000 hours has usually consumed a small fraction of its endurance — a very different proposition from a used hard drive.',
    filters: { condition: ['used', 'renewed'], technology: [...SSD_ALL] },
    related: ['u2-enterprise', 'nas-ssd', 'sata-2-5', 'tlc'],
  },

  // ── SSD: capacity ────────────────────────────────────────────────────────
  {
    category: 'ssd',
    slug: '1tb',
    label: '1TB SSD',
    title: '1TB SSDs by Price per TB',
    description:
      'Every in-stock 1TB SSD, NVMe and SATA, ranked by cost per terabyte with shipping folded into the price.',
    intro:
      'The default size for a boot drive, and increasingly the floor rather than the target — a handful of modern games will fill it.',
    filters: { technology: [...SSD_ALL], capMin: 0.95, capMax: 1.05 },
    related: ['2tb', 'gaming', 'm2-2230', 'nvme-gen4'],
  },
  {
    category: 'ssd',
    slug: '2tb',
    label: '2TB SSD',
    title: '2TB SSDs by Price per TB',
    description:
      'Every in-stock 2TB SSD, usually the best value in consumer flash, ranked by cost per terabyte.',
    intro:
      'Usually the best $/TB in consumer flash: high enough to amortise the controller and packaging, mainstream enough to be produced in volume.',
    filters: { technology: [...SSD_ALL], capMin: 1.9, capMax: 2.1 },
    related: ['1tb', '4tb-ssd', 'gaming', 'nvme-gen4'],
  },
  {
    category: 'ssd',
    slug: '4tb-ssd',
    label: '4TB SSD',
    title: '4TB SSDs by Price per TB',
    description:
      'Every in-stock 4TB SSD, NVMe and SATA, ranked by cost per terabyte with the NAND type shown per row.',
    intro:
      'The largest capacity widely available in single-sided M.2, which matters for laptops and handhelds. QLC is common at this size — check the technology column.',
    filters: { technology: [...SSD_ALL], capMin: 3.8, capMax: 4.2 },
    related: ['2tb', '8tb-ssd', 'qlc', 'sata-2-5'],
  },
  {
    category: 'ssd',
    slug: '8tb-ssd',
    label: '8TB SSD',
    title: '8TB SSDs by Price per TB',
    description:
      'Every in-stock 8TB SSD, consumer M.2 and enterprise U.2, ranked by cost per terabyte with shipping included.',
    intro:
      'The top of consumer flash, and where enterprise U.2 stock starts to undercut consumer M.2 by a wide margin if you can host it.',
    filters: { technology: [...SSD_ALL], capMin: 7.5, capMax: 8.5 },
    related: ['4tb-ssd', 'u2-enterprise', 'used-enterprise-ssd', 'qlc'],
  },
];

/**
 * The cross-cutting route. It has no category segment, so it is its own file
 * rather than part of [category]/[slug] — Appendix C specifies this URL and a
 * curated route is not worth relocating for the sake of tidy routing.
 */
export const CHEAPEST_LANDING: Omit<Landing, 'category'> = {
  slug: 'cheapest-per-tb',
  label: 'Cheapest per TB',
  title: 'The Cheapest Storage per Terabyte, Anywhere',
  description:
    'Every in-stock HDD and SSD across Amazon and eBay, ranked by cost per terabyte with shipping included and multi-drive lots divided.',
  intro:
    'No filters, everything ranked. Shipping is folded in and multi-drive lots are divided by their drive count, which is why the top of this table looks different from every competitor: an undetected lot of five 4TB drives reads as $13/TB and sits at the top forever.',
  filters: {},
  related: ['used-enterprise', 'shuckable', 'sas', 'qlc'],
};

// ---------------------------------------------------------------------------

export const LANDING_COUNT = LANDINGS.length;

export function findLanding(category: string, slug: string): Landing | undefined {
  return LANDINGS.find((l) => l.category === category && l.slug === slug);
}

export function landingPath(landing: Pick<Landing, 'category' | 'slug'>): string {
  return `/${landing.category}/${landing.slug}`;
}

export function landingsByCategory(category: LandingCategory): Landing[] {
  return LANDINGS.filter((l) => l.category === category);
}

/**
 * Resolves a related slug, preferring the linking page's own category.
 *
 * `2tb` exists under both categories — `/hdd/2tb` and `/ssd/2tb` are different
 * pages and both deserve the obvious URL. Same-category-first means a related
 * link from an HDD page lands on the HDD one without every entry having to
 * spell out a path, and cross-category links (an HDD page pointing at
 * `sata-2-5`) still resolve by falling through.
 */
export function resolveRelated(
  slug: string,
  from?: LandingCategory,
): Landing | undefined {
  if (from) {
    const sameCategory = LANDINGS.find((l) => l.slug === slug && l.category === from);
    if (sameCategory) return sameCategory;
  }
  return LANDINGS.find((l) => l.slug === slug);
}

/**
 * The landing's filters are the starting point; anything the visitor sets in
 * the rail overrides that key. Intersecting instead would let one click empty
 * the page, and the rail would be a dead control on every landing.
 */
export function resolveLandingQuery(
  landing: Pick<Landing, 'filters'>,
  base: Query,
): Query {
  return { ...base, ...landing.filters };
}

export function landingBaseQuery(landing: Pick<Landing, 'filters'>): Query {
  return { ...EMPTY_QUERY, ...landing.filters };
}
