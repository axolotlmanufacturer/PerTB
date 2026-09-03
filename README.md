# perterabyte

A storage price comparison site. One dense, sortable table of every in-stock HDD
and SSD across Amazon and eBay — new and used — ranked by **price per terabyte**
and filterable along four independent technical axes. Outbound links are
affiliate-tagged.

Storage is the one PC component where the sticker price tells you almost
nothing: a 2 TB SSD and a 20 TB hard drive can cost the same money. The only
honest comparison is price per terabyte, and nobody sells drives with that
number on the label.

---

## Read this first: Amazon is not a reliable source

**The site is built to run without Amazon, permanently, and that is not a
degraded mode.**

Amazon's Product Advertising API 5.0 is retired and no longer accepts new
registrations. Its replacement, the **Creators API**, requires **at least 10
qualifying sales in the trailing 30 days**, and access is **revoked after any
30-day stretch without them**. A brand-new site has no sales, therefore no
Amazon access, therefore a chicken-and-egg problem that resolves only after eBay
traffic starts converting.

Consequences baked into the architecture:

- `AMAZON_ENABLED=false` is the default and the expected state at launch.
- A `403 AssociateNotEligible` is a **logged warning**, never a failed ingest,
  never a failed build, never an empty page.
- There are tests that run the entire ingest with Amazon disabled, and again
  with an adapter that throws `AmazonNotEligibleError`, asserting a populated
  database and a rendering site both times.
- **eBay is the primary source**, and it is also the differentiator: used
  enterprise drives live on eBay, and that is where the genuinely lowest $/TB on
  the market sits.

Credential acquisition order is therefore: **eBay first. Amazon when eligible.**

## Two other things that are not negotiable

**The number must be right.** The site has exactly one asset: the $/TB figure is
trustworthy. A wrong number is worse than a missing one — a missing one costs a
listing, a wrong one costs the user permanently. Listings whose specifications
cannot be resolved with confidence are **quarantined, not guessed at**. Coverage
is not the metric.

**No scraping. Ever.** Product data comes from official APIs only. There is no
code, no stub and no feature flag anywhere in this repository that fetches
retailer HTML. It would breach Amazon's Conditions of Use and the Associates
Operating Agreement, and a dormant flag is still evidence of intent.

Both are elaborated in [`CLAUDE.md`](./CLAUDE.md), which is the working
constitution for this codebase.

---

## Running it

Requires **Node 22+**, **pnpm 10+**, and **Docker** (for the local database).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`http://localhost:3000`.

No credentials are required. `MOCK_DATA=true` is the default, and the mock
adapter generates realistic listings — messy titles, multi-drive lots,
out-of-stock rows and all — so the entire site is buildable and demoable before
any API key exists.

### Local database

```bash
pnpm db:up        # Postgres 17 on :5432, matching DATABASE_URL in .env.example
pnpm db:migrate   # apply migrations (creates one if the schema changed)
pnpm seed         # populate it — ~400 generated offers, no credentials needed
pnpm db:down
```

`pnpm seed` is `pnpm ingest` against the mock adapters plus a back-dated price
history, so the 90-day sparkline column has something to draw locally and in
CI. It writes fabricated observations and therefore refuses to run against
anything but a local database. Use `pnpm ingest` for a real sweep.

Note that `pnpm test` **truncates the tables** when `DATABASE_URL` is set: the
Amazon resilience tests need a real database and clear it between cases. Re-run
`pnpm seed` afterwards. CI is unaffected — each job gets its own Postgres
service.

Production uses [Neon](https://neon.tech). Use the **pooled** connection string
with the Neon serverless driver adapter — Prisma exhausts direct connections on
serverless.

Prisma 7 reads the datasource URL from `prisma.config.ts`, not from
`schema.prisma`. At runtime the client takes a driver adapter rather than a URL:
`src/lib/db.ts` picks the Neon serverless adapter for a Neon host and
node-postgres for anything else, so the same code runs locally and on Vercel.

### Everything else

| Command                             | What it does                                     |
| ----------------------------------- | ------------------------------------------------ |
| `pnpm dev`                          | Dev server                                       |
| `pnpm build`                        | Production build                                 |
| `pnpm start`                        | Serve the production build                       |
| `pnpm typecheck`                    | `tsc --noEmit`                                   |
| `pnpm lint`                         | ESLint                                           |
| `pnpm format` / `pnpm format:check` | Prettier                                         |
| `pnpm test`                         | Unit tests (Vitest)                              |
| `pnpm ingest`                       | One sweep: fetch, normalise, upsert, expire      |
| `pnpm seed`                         | Mock data into a local database                  |
| `pnpm test:coverage`                | Unit tests + the coverage gate CI enforces       |
| `pnpm test:e2e`                     | End-to-end tests (Playwright)                    |
| `pnpm lighthouse`                   | Core Web Vitals budget CI enforces               |
| `pnpm verify`                       | Typecheck + lint + unit + build, as CI runs them |

Playwright needs its browser once: `pnpm exec playwright install chromium`.

---

## Stack

Next.js 15 (App Router) · TypeScript strict · Postgres (Neon) · Prisma · Vercel.

The comparison table is **server-rendered**. `app/page.tsx` and every landing
route are React Server Components that read `searchParams`, query Postgres
directly, and emit fully-populated `<table>` markup. The facet rail is the only
client island of consequence, and the page must be complete and correct with
JavaScript disabled — the entire business model is organic search for long-tail
comparison queries, so Googlebot's first paint cannot be an empty table.

Ingest runs in **GitHub Actions on a 3-hourly cron**, not Vercel Cron, which
caps at 300 seconds — less than a full two-marketplace sweep. `/api/cron/refresh`
is a bearer-gated manual trigger and the cache-revalidation hook the Action calls
on completion; it does not run the sweep.

Offers carry an expiry — 6 hours for eBay, a 24-hour hard ceiling for Amazon —
and the ingest job **hard-deletes** anything past it. Every read path filters on
`expiresAt > now()`. If ingest stops running, the table empties. That is the
intended behaviour, not a bug: displaying a price we can no longer refresh
breaches the Associates Operating Agreement, and a stale number is exactly the
kind of wrong number this site cannot afford.

---

## Build status

Phased, with a review checkpoint at the end of each phase.

| Phase | Scope                                                  | State        |
| ----- | ------------------------------------------------------ | ------------ |
| 0     | Repository and guardrails                              | **complete** |
| 1     | Domain core — taxonomy, normalisation, pricing, schema | **complete** |
| 2     | Ingest — adapters, affiliate links, sweep              | **complete** |
| 3     | The table — facets, duplicate collapse, dispersion     | **complete** |
| 4     | SEO surface — ~40 curated landing routes               | **complete** |
| 5     | Price history and shucking                             | **complete** |
| 6     | Deal alerts                                            | next         |
| 7     | Editorial, admin and compliance                        | planned      |

The launch checklist — credential acquisition order, DNS, Search Console and the
first-ingest runbook — lands with Phase 7 (ticket 7.6).

---

## Repository conventions

- **Conventional commits**, one branch per phase.
- `CLAUDE.md` is the constitution: non-negotiables, the domain contract, and the
  known traps. Read it before touching `pricing.ts`, `normalize.ts`,
  `taxonomy.ts`, `affiliate.ts` or anything under `src/lib/sources/`.
- **`src/lib/affiliate.ts` is excluded from all autofix.** Its URL parameters
  are contractual with the affiliate networks; dropping `mkevt` or `toolid`
  silently zeroes revenue while the links still appear to work. Prettier ignores
  it, ESLint's fixable rules are disabled for it, and
  `test/unit/affiliate-immutability.test.ts` asserts the fixer and formatter
  leave it byte-identical.

### Deviations from the brief

**`NEXT_PUBLIC_SENTRY_DSN`**, added to Appendix B, optional and unset by
default. Browser-side error reporting needs the DSN inlined into the client
bundle at build time, which requires the `NEXT_PUBLIC_` prefix; the brief's
`SENTRY_DSN` covers the server and edge runtimes only. Leave it unset to report
from the server alone.

**Amazon Creators API transport.** The brief gives the auth URL and the
OffersV2 requirement but not the endpoint. The Creators API turns out to be a
new _endpoint for the PA-API operations_ rather than a differently-shaped API:
`POST https://creatorsapi.amazon/catalog/v1/searchItems`, marketplace routed by
an `x-marketplace` header, `Authorization: Bearer <token>, Version <n>`, and
lowerCamelCase fields where PA-API used PascalCase. A request must name the
`resources` it wants or the response carries neither titles nor offers. Two
values remain unverifiable without credentials and are env-overridable:
`AMAZON_CREDENTIAL_VERSION` and the optional `AMAZON_OAUTH_SCOPE`.

**Affiliate links are built at render time, not at ingest.** The sub-id is the
landing slug, so the same offer earns under a different sub-id depending on
which route sent the visitor (ticket 4.6). A link baked into the database
would collapse every route into one undifferentiated bucket.

**Golden corpus provenance.** The brief asks for the corpus to be expanded from
real Amazon and eBay listing titles. The titles in `test/fixtures/titles.json`
are **constructed**, not harvested: collecting real ones would mean pulling
retailer HTML, which the no-scraping rule forbids outright, and the official
APIs need credentials this repository does not have. They are modelled closely
on real listing conventions and real product names, and cover every trap
category the brief enumerates.

**Five axes, not four.** The brief says "four independent axes" in prose but
specifies five enumerations, and ticket 3.1 asks the query layer for five
independent facet count maps. `AXES` carries all five so every enumeration gets
the skip-your-own-axis treatment. How many appear as checkbox groups in the rail
is a Phase 3 presentation decision.

**The badge states the window it observed, not the window it searched.** The
brief calls for a "cheapest in 90 days" badge. On a site three weeks old that
sentence is false while its arithmetic is correct, which is the failure mode
§1.1 exists to prevent — so the badge reads `65d low` on sixty-five days of
data, and says nothing at all below seven days or where the price has never
moved. Equal-lowest on a flat line is not a deal.

**Price history is only as deep as a listing has been live.** `PricePoint`
cascades from `Offer`, and the expiry pass hard-deletes offers, so when an eBay
item sells its history goes with it. That is consistent — the history has no
display surface once the offer is gone — but it does mean the 18-month
retention job (5.5) only ever bites on listings that stayed live for a year and
a half, which in practice is stable Amazon ASINs. Detaching history from the
offer would need a schema-breaking migration, so it is a question rather than a
change.

**The drive detail view is `noindex, follow`.** Its URL is a database id and its
content expires within hours. Indexing a few thousand of them would fill the
index with soft-404s and dilute the curated routes Phase 4 exists to rank.

**Sealed enclosures publish with an honest blank.** All four shuckable
external families used to assert a recording technology below the publish
threshold, so every one of them quarantined and `/hdd/shuckable` had no rows at
all — §3.8's "most-searched insight in the niche" had no surface. A curated
entry can now declare an axis `unknowable`, which asserts nothing, suppresses
the family-regex fallback, and is left out of the confidence minimum. The row
publishes with `technology: null`, rendered "—", and `passes()` still refuses
to match a null axis against a filter on it. See the amended §3.3 in
`CLAUDE.md`; the clause is deliberately narrow and a WD Blue whose title
omitted the model number still quarantines.

**Sub-threshold dictionary entries.** Twelve drive families whose recording
technology or NAND type genuinely varies across capacities and production runs
(WD Blue 3.5", WD Red non-Plus, Toshiba P300, Crucial BX500, the Kingston NV
line, the shuckable externals) assert their likely value at a confidence _below_
the publish threshold. They quarantine unless the title states CMR/SMR outright
or a specific model number resolves them. The brief's curated table lists WD
Blue as SMR; that is true of some models and false of others, and publishing a
guess is the failure mode the confidence rule exists to prevent.

---

## Resolved: unknown axes versus quarantine

Raised in Phase 5, decided by a human, and implemented — the amended §3.3 in
`CLAUDE.md` is the authority.

An unresolved axis contributes a confidence of **zero**, and confidence is the
minimum across axes, so a listing must resolve capacity, technology, form factor
_and_ interface confidently or it does not appear. That is unchanged, and it is
right wherever the fact exists to be read.

The one exception is where it does not. A curated entry may declare an axis
`unknowable`: it then asserts no value, suppresses the family-regex fallback
(which returns `hdd_cmr` at 0.4 for any unmatched HDD, so dropping the
assertion without this would swap one guess for another), and is left out of the
confidence minimum rather than scoring zero — it is not a failed reading, so it
is not evidence about how well the rest of the listing was read. An explicit
CMR/SMR token in the title still overrides it: whoever wrote that opened the
box.

The line is whether the fact exists to be read at all. What is inside a sealed
WD Elements is disclosed by nobody and varies by production run, so waiting
resolves nothing; a WD Blue's recording technology is a knowable property of a
specific model number that this listing happened to omit, so it waits. Today the
only members of `unknowable` are the recording technologies of the four sealed
external enclosures, and a dictionary test fails if an entry ever declares an
axis unknowable and asserts it too.

---

## Legal

Affiliate disclosures, privacy policy and terms land in Phase 7 and will be
flagged for legal review. Nothing in this repository is legal advice.
