# CLAUDE.md — perterabyte

Permanent working memory for this repository. Distilled from the build brief,
Sections 2 (non-negotiables), 4 (domain contract) and 7 (known traps).

The build brief is a **plan**. This file is the **constitution**. Where the two
disagree, or where a later instruction would be more convenient than what is
written here, this file wins until a human changes it.

Read this file before touching `src/lib/pricing.ts`, `src/lib/normalize.ts`,
`src/lib/affiliate.ts`, `src/lib/taxonomy.ts`, or anything under
`src/lib/sources/`.

---

## 0. What this product is

One dense, sortable table of every in-stock HDD and SSD across Amazon and eBay,
new and used, ranked by **price per terabyte**, filterable along four independent
technical axes, with affiliate-tagged outbound links.

That table is the entire product. Landing pages, guides and alerts exist only to
bring people to it or bring them back.

Audience: NAS builders, homelab operators, data hoarders, PC builders. They are
technical, they are price-sensitive to the cent, and **they will notice a wrong
number instantly and never come back**. Design accordingly: density over
whitespace, no marketing voice, no hero section.

Differentiation, which must not be eroded:

1. **eBay inclusion** — where used enterprise drives live, which is where the
   genuinely lowest $/TB on the market sits.
2. **Independent faceting** on Technology / Form factor / Interface, instead of
   the flat category checkbox list the incumbents use.
3. **Correctness the incumbents don't bother with** — shipping folded into the
   calculation, multi-drive lots detected and divided, CMR/SMR resolved.

---

## 1. Non-negotiables

These override convenience, they override any judgement about what would be
faster, and they are not open to renegotiation mid-build.

### 1.1 The number must be right

The site has exactly one asset: the $/TB figure is trustworthy. **A wrong number
is worse than a missing one**, because a missing one costs you a listing and a
wrong one costs you the user permanently.

It is always correct to **quarantine a listing rather than publish it with a
guessed specification**. When normalisation confidence is below threshold, the
listing does not appear. Do not add fallbacks that "make a reasonable assumption"
to raise coverage. **Coverage is not the metric.**

If you are ever choosing between "show more rows" and "show only rows we can
defend", choose the latter every time.

### 1.2 No scraping. Ever.

Do not write, scaffold, stub, or leave feature-flagged any code that fetches
product data from `amazon.com`, `ebay.com`, or any retailer's HTML. It breaches
Amazon's Conditions of Use and the Associates Operating Agreement.

**A dormant flag is still evidence of intent.** If an official API cannot supply
something, the site does without it.

### 1.3 The 24-hour rule is structural, not procedural

Amazon's Associates Operating Agreement requires that displayed prices come from
the API and be refreshed or removed within 24 hours.

This is enforced by `Offer.expiresAt` plus a **hard-delete pass in the ingest
job** — not by a comment, not by a cron you hope runs. **Every read path filters
on `expiresAt > now()`.**

If ingest breaks for two days, the table empties. **That is the correct
behaviour.** Do not add a grace period, a "stale but probably fine" badge, or a
fallback to the last known price.

### 1.4 Amazon is an intermittently-available source

Amazon's Creators API requires ≥10 qualifying sales in the trailing 30 days and
revokes access after any 30-day stretch without them. **Treat Amazon as a source
that can vanish at any moment.**

A `403 AssociateNotEligible` is a logged warning — never a fatal error, never a
failed build, never an empty page. The site must be **fully functional on eBay
alone**.

There must be a test that runs the whole ingest with the Amazon adapter disabled
and asserts the site still renders a populated table. This test is load-bearing;
do not delete or skip it.

### 1.5 Facets are independent, not nested

See §3.5. Getting this wrong silently degrades the UI into radio buttons and is
the single most common bug in faceted search.

### 1.6 Do not touch without asking

- Schema-breaking migrations (after Phase 1).
- **`src/lib/affiliate.ts`** — the URL parameters are contractual with the
  affiliate networks. A "cleanup" that drops `mkevt` or `toolid` silently zeroes
  revenue. Parameter order and presence are contractual. ESLint autofix must not
  touch this file.
- Adding any paid dependency or paid service tier.

---

## 2. Settled decisions — do not relitigate

| Area            | Decision                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack           | Next.js 15 App Router, TypeScript strict, Postgres (Neon), Prisma, deployed on Vercel                                                                         |
| Rendering       | Server-rendered table reading `searchParams` in an RSC. Facets are a thin client island. **The table must be in the initial HTML — this is an SEO property.** |
| Data sources v1 | eBay Browse API + Amazon Creators API. Adapter interface stays open for Newegg/B&H later; **do not implement them.**                                          |
| Build-time data | Mock-first. A `mockAdapter` generates realistic listings so the whole site works before any credential exists.                                                |
| Locale          | US only, USD. But `locale` is a column on `Offer` from day one so multi-market is a migration, not a rewrite.                                                 |
| Catalogue       | **HDD and SSD only.** No flash, RAM, tape or optical — they dilute the $/TB framing.                                                                          |
| Ingest runtime  | GitHub Actions, 3-hourly. Vercel cron caps at 300s and a full sweep exceeds it. Vercel route kept only as a manual trigger.                                   |
| Cache           | ISR with `revalidateTag`, fired by the ingest job on completion.                                                                                              |
| Auctions        | **Excluded.** A moving price cannot be ranked between refreshes.                                                                                              |
| Images          | **None.** Text-only table. Amazon requires images be served from their CDN and they add a compliance surface for no conversion benefit.                       |
| Accounts        | None. Deal alerts are email-address-only, no password.                                                                                                        |
| ORM             | **Prisma. Do not propose Drizzle.**                                                                                                                           |
| Analytics       | Plausible + Sentry free tier.                                                                                                                                 |
| Structured data | `ItemList` and `BreadcrumbList` only. **No `Product` markup** — Google penalises it for items you don't sell.                                                 |
| Brand           | `perterabyte` as a placeholder, parameterised via `NEXT_PUBLIC_SITE_NAME`.                                                                                    |

---

## 3. Domain contract

This is the specification the tests encode.

### 3.1 The four independent axes

Exactly these keys. They are the API surface, the URL parameters, and the
database values. **Do not invent variants or rename them for tidiness.**

```ts
TECHNOLOGY = {
  hdd_cmr: 'HDD · CMR',
  hdd_smr: 'HDD · SMR',
  sshd: 'Hybrid SSHD',
  ssd_tlc: 'SSD · TLC NAND',
  ssd_qlc: 'SSD · QLC NAND',
  ssd_mlc: 'SSD · MLC NAND',
};

FORM_FACTOR = {
  '3.5': '3.5-inch',
  '2.5': '2.5-inch',
  m2_2280: 'M.2 2280',
  m2_2230: 'M.2 2230',
  u2: 'U.2 / U.3',
  ext_desktop: 'External desktop',
  ext_portable: 'External portable',
};

INTERFACE = {
  sata3: 'SATA III 6Gb/s',
  sas12: 'SAS 12Gb/s',
  pcie3: 'PCIe 3.0 ×4 (NVMe)',
  pcie4: 'PCIe 4.0 ×4 (NVMe)',
  pcie5: 'PCIe 5.0 ×4 (NVMe)',
  usb_g1: 'USB 3.2 Gen 1',
  usb_g2: 'USB 3.2 Gen 2',
  usb_g2x2: 'USB 3.2 Gen 2×2',
};

CONDITION = { new: 'New', renewed: 'Renewed', used: 'Used' };
MARKETPLACE = { amazon: 'Amazon', ebay: 'eBay' };
```

Plus a **capacity range** (numeric min/max in TB) and three **boolean
adjustments**: include shipping, hide lots, in stock only.

`src/lib/taxonomy.ts` is the single source of truth for these. Nothing else
declares them.

### 3.2 The $/TB definition

One function, one file (`src/lib/pricing.ts`). **No second implementation
anywhere** — not in a component, not in a SQL expression, not in the ingest job.

```
totalBytes     = capacityBytesOfOneDrive × lotSize
effectiveCents = priceCents + (includeShipping ? shippingCents : 0)
pricePerTB     = effectiveCents ÷ (totalBytes ÷ 1_000_000_000_000)
```

**Decimal terabytes, not binary.** A drive sold as "20TB" contains 20 × 10¹²
bytes and presents as ~18.2 TiB once formatted. Price against the advertised
figure, because that is the figure the buyer is comparing across listings.
Switching to TiB would make every number on the site ~10% higher than every
competitor's and read as a bug.

**Shipping is included by default.** Without it, eBay's $0.99 item + $28 shipping
listings beat everything on Amazon permanently and sit at the top of the table
forever.

$/TB is **derived at read time, never stored**, because the shipping and lot
rules are user-toggleable.

### 3.3 Normalisation — the correctness layer

Neither marketplace gives you a trustworthy `capacityBytes`, `formFactor` or
`interface`. Amazon's `ItemInfo` attributes are seller-supplied and frequently
absent; eBay's item aspects are worse. **Everything rests on parsing the title.**

| Rule                                                            | Why it exists                                                                                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacity regex requires a **unit adjacent to the number**       | Otherwise `7200 RPM`, `256MB cache` and `6Gb/s` all parse as capacity                                                                                                             |
| Sanity envelope: **reject below 120 GB or above 40 TB**         | Below is legacy junk with unreliable pricing; above does not exist as a single retail drive, so a match that large is a lot or a cache figure                                     |
| **Lot detection**: `Lot of 5`, `4 x 8TB`, `6-pack`, `qty 3`     | An undetected `Lot of 5 × 4TB, $260` computes to $13/TB and sits at the top of the table forever, wrong. **This is the highest-value rule in the file.**                          |
| **CMR/SMR resolved from a curated family table, not the title** | It is almost never stated, and it decides whether a drive survives a RAID rebuild. IronWolf / Exos / Ultrastar / Red Pro → CMR; BarraCuda (non-Pro) / WD Blue / My Passport → SMR |
| **Confidence is the MINIMUM across axes, not the mean**         | A listing with perfect capacity but unknown interface must not surface in an interface-filtered view just because two other axes were confident                                   |
| **Threshold 0.6**; below it the listing is quarantined          | Reviewed in `/admin/quarantine` (ticket 7.2)                                                                                                                                      |

Dictionary lookup (`src/lib/spec-dictionary.json`) runs **before** regex and
raises confidence when it hits.

#### The unknowable-axis clause

**Amended by a human during Phase 5.** The minimum rule above stands unchanged
for every axis that has a value waiting to be read. This clause covers the case
where there is nothing to read at all.

A curated dictionary entry may list axes as `unknowable`. Such an axis:

- asserts **no value** — an entry must not carry both, and a test enforces it;
- suppresses the family-regex fallback, which would otherwise substitute one
  guess for another (`classifyTechnology` returns `hdd_cmr` at 0.4 for any
  unmatched HDD);
- is **left out of the confidence minimum** rather than scoring zero, because
  it is not a failed reading and is therefore not evidence about how well the
  rest of the listing was read;
- is **overridden by an explicit token in the title**. A seller who writes
  "CMR" has opened the box; that is evidence about this unit.

The line is whether the fact exists to be read:

- **Knowable, not stated here** — a WD Blue whose title omitted the model
  number. Quarantines, and a later listing carrying the model number resolves
  it. Nothing about this changed.
- **Disclosed by nobody** — the drive inside a sealed WD Elements, which varies
  by production run. Publishes with `technology: null`, rendered "—".

The safety property still holds structurally: `passes()` refuses to match a
null axis against a filter on that axis, so such a row can never appear in a
technology-filtered view. It appears in the unfiltered table and on
`/hdd/shuckable`, which is what §3.8 requires and what the previous reading
made impossible — all four shuckable families quarantined, so the shucking
insight had no surface at all.

**Do not widen this.** Adding an axis to `unknowable` is a claim that no
listing anywhere will ever state it. Today the only members are the recording
technologies of the four sealed external enclosures.

### 3.4 Data model

```
Product  ─1:N─  Offer  ─1:N─  PricePoint
```

- **`Product`** is the physical drive: `brand`, `model`, `capacityBytes` (BigInt,
  capacity of **ONE** drive), `technology`, `formFactor`, `interface`, `rpm`,
  `confidence`, `mpn`. Unique on `(brand, model, capacityBytes)`.
- **`Offer`** is one marketplace listing of it: `marketplace`, `externalId` (ASIN
  or eBay legacy item id), `condition`, `lotSize`, `priceCents`, `shippingCents`,
  `currency`, `locale`, `inStock`, `sellerName`, `sellerScore`, `powerOnHours`,
  `hasWarranty`, `returnPolicy`, `url`, `fetchedAt`, `expiresAt`. Unique on
  `(marketplace, externalId)`.
- **`PricePoint`** is an observation: `offerId`, `priceCents`, `shippingCents`,
  `observedAt`. **Only written when the price actually changed**, or the table
  grows by the full catalogue size eight times a day.

### 3.5 The facet independence invariant

When counting how many drives sit behind a given facet option, apply **every
filter except that facet's own axis**:

```ts
function passes(row, query, skipAxis: Axis | null): boolean {
  // ... boolean adjustments and capacity range always apply ...
  for (const axis of AXES) {
    if (axis === skipAxis) continue;
    if (query[axis].length && !query[axis].includes(row[axis])) return false;
  }
  return true;
}

const matched = rows.filter((r) => passes(r, query, null));
for (const axis of AXES) {
  facetCounts[axis] = tally(
    rows.filter((r) => passes(r, query, axis)),
    axis,
  );
}
```

Skip the `skipAxis` argument and selecting PCIe 4.0 drives every other interface
count to zero, and the axis silently degrades into a radio group.

There is a Playwright test for this specifically: select one interface, assert
the other interface options still show non-zero counts and remain clickable.

At this scale (single-digit thousands of live rows) **do the whole thing in
memory after one query**. Pushing five independent `GROUP BY`s into SQL costs
more than one scan.

### 3.6 Duplicate collapse

The same drive is listed by six eBay sellers. Collapse to **one row per
`(productId, condition)`**, showing the cheapest offer, with a count badge
(`6 offers`) that expands inline to show all of them with seller names.

**Do not collapse across conditions** — new and used of the same drive are
different products to a buyer.

### 3.7 Used-drive risk surfacing

Used rows must show, where available: **power-on hours** (parsed from
title/description), a **no-warranty flag**, and the **seller return policy**.

Users buying datacentre pulls are making an explicit risk trade and the table
must let them make it with open eyes. An unqualified "$4.20/TB" on a drive with
45,000 hours and no returns is a **misleading number even though the arithmetic
is right**.

### 3.8 The shucking insight

A WD Elements 20TB external contains a white-label CMR drive and routinely beats
the bare equivalent on $/TB. This is the most-searched insight in the niche.

`Product` carries `shuckable: boolean` and `shuckedEquivalent: string?`,
populated from the curated dictionary, surfaced as a badge, with a dedicated
landing page.

---

## 4. Known traps

Every one of these has bitten someone building this exact site.

1. **Binary vs decimal TB.** See §3.2. Using 2⁴⁰ makes every number wrong by 10%.
2. **BigInt is not JSON-serialisable.** `capacityBytes` must be `.toString()`ed
   at every API boundary. **This will throw at runtime, not compile time.**
3. **Prisma on serverless exhausts connections without pooling.** Use the Neon
   serverless driver adapter, and the `globalThis` singleton pattern so dev-mode
   HMR doesn't open a pool per reload.
4. **Vercel cron caps at 300 seconds.** A full keyword sweep across two
   marketplaces exceeds it. Ingest runs in GitHub Actions; the Vercel route is a
   manual trigger only.
5. **Facet nesting.** See §3.5.
6. **eBay `shippingCostType: CALCULATED` returns no cost** — the buyer's postcode
   determines it. Treat as 0 **and flag**; do not invent a figure.
7. **Amazon feed prices are delivered-price for Prime items.** Do not add a
   shipping estimate on top; you'd double-count.
8. **Auctions.** Excluded by the `buyingOptions` filter. If one leaks through,
   its price is stale the moment you store it.
9. **`ItemInfo.Title` can be absent** on Creators API responses. Guard
   everything.
10. **Rate limits.** Sleep ~400ms between keyword calls. Both APIs will throttle
    a tight loop and the errors are unhelpfully generic.
11. **`revalidateTag` from a GitHub Action needs an authenticated route** on the
    Vercel side; it cannot be called directly from outside the deployment.
12. **Don't let ESLint autofix touch `affiliate.ts`.** Parameter order and
    presence are contractual.

---

## 5. External API facts worth not re-deriving

### eBay — Browse API + eBay Partner Network

- OAuth2 client-credentials against
  `https://api.ebay.com/identity/v1/oauth2/token`, scope
  `https://api.ebay.com/oauth/api_scope`. Tokens last ~2 hours; cache in module
  scope.
- Search: `GET https://api.ebay.com/buy/browse/v1/item_summary/search`
- **Affiliate attribution is a header.** Without it the traffic earns nothing:
  ```
  X-EBAY-C-ENDUSERCTX: affiliateCampaignId=<10-digit ePN campaign id>,contextualLocation=country%3DUS
  X-EBAY-C-MARKETPLACE-ID: EBAY_US
  ```
- Required query filters — this is what keeps enclosures, cables and caddies out
  of the table:
  ```
  category_ids=175669,175670,131553
  filter=buyingOptions:{FIXED_PRICE},itemLocationCountry:US,deliveryCountry:US
  ```
- Seller quality floor: reject sellers below 98.5% feedback or fewer than 50
  feedback events. Both configurable via env.
- Link building (the Feed API does not return tracking links, so build them):
  ```
  {itemWebUrl}&mkevt=1&mkcid=1&mkrid={EPN_ROTATION_ID}&campid={EPN_CAMPAIGN_ID}&toolid=10001&customid={subId}
  ```
  `customid` is the landing-page slug, so revenue attributes to routes.
- **TTL: 6 hours.** eBay inventory is single-unit and vanishes the moment it
  sells.

### Amazon — Creators API

- **PA-API 5.0 is retired and no longer accepts new registrations. Do not follow
  any PA-API tutorial; the SigV4 request-signing approach is dead.**
- Credentials from Associates Central → Tools → Creators API → Create
  Application.
- OAuth2 client-credentials against `https://api.amazon.com/auth/o2/token`.
- `Offers` is deprecated; use **`OffersV2`**.
- Eligibility: ≥10 qualifying sales in the trailing 30 days. Revoked after any
  30-day stretch without qualifying sales; restored automatically ~2 days after
  referred sales ship again.
- `403 AssociateNotEligible` → distinct typed error `AmazonNotEligibleError`,
  caught in ingest, logged as a warning, break out of the Amazon loop, continue
  with eBay. **Never let it fail the run.**
- **TTL: 24 hours, hard ceiling**, per the Operating Agreement.
- Link format:
  `https://www.amazon.com/dp/{ASIN}?tag={AMAZON_PARTNER_TAG}&linkCode=ogi&th=1`,
  with the per-route subid appended.

### Mock adapter

`MOCK_DATA=true` switches to it. **This is the default for local dev and CI.**
Same `SourceAdapter` interface, ~400 realistic listings from a hardcoded
catalogue of ~50 real drive families: deterministic PRNG, price jitter around a
plausible per-TB baseline, new/renewed/used variants (used skewed to enterprise
families), realistic multi-drive lots (so the lot-detection path is exercised),
some out-of-stock rows, and **titles written in the messy style real listings
use, so normalisation is genuinely tested rather than fed clean input**.

---

## 6. Rendering split

The current-generation mistake here is fetching the table client-side.
Googlebot's first paint would be an empty table on a site whose entire business
model is organic search for long-tail comparison queries.

Therefore:

- `app/page.tsx` and each landing are **RSCs** that read `searchParams`, query
  Postgres directly, and emit fully-populated `<table>` markup.
- `FacetRail` is a client component that updates the URL; navigation re-renders
  on the server.
- ~~`/api/offers` exists for optimistic client-side refetches on facet
  toggles~~ — **removed.** `FacetRail` navigates through the router instead, so
  the server re-renders and the URL stays shareable, which is strictly better
  than a JSON refetch: one source of truth for the table, and the shared link
  carries the filter state. Nothing ever called the route. It was an unused,
  unauthenticated export of the whole catalogue, and an endpoint nobody uses is
  an endpoint nobody maintains.

  The property it existed to protect is unchanged and still tested: **the page
  must be complete and correct with JavaScript disabled**, verified with `curl`
  in a test and by running the whole Playwright suite a second time with
  scripting off.

---

## 7. Working agreement

- **Conventional commits. One branch per phase.**
- **Stop for review at the end of each phase** with a written summary, the demo
  command, a screenshot where there is UI, and an explicit list of anything
  assumed because the brief was silent on it.
- Per ticket: tests green, `tsc --noEmit` clean, lint clean.
- Phase 1 gate: golden corpus passes at 100%; coverage on `normalize.ts` and
  `pricing.ts` above 90%.

### Ask, do not assume

Stop and ask about:

- The transactional email provider (ticket 6.6).
- Anything requiring a paid tier.
- Any schema-breaking migration after Phase 1.
- Any change to `affiliate.ts`.
- Whether to widen the catalogue beyond HDD/SSD if the taxonomy strains.
- **Any case where you believe a non-negotiable in §1 is wrong — argue it, don't
  quietly work around it.**
