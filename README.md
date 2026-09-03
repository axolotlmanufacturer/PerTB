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
pnpm db:down
```

Production uses [Neon](https://neon.tech). Use the **pooled** connection string
with the Neon serverless driver adapter — Prisma exhausts direct connections on
serverless.

Prisma 7 reads the datasource URL from `prisma.config.ts`, not from
`schema.prisma`. At runtime the client takes an adapter rather than a URL; that
wiring lands with `src/lib/db.ts` in Phase 2.

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
| `pnpm test:coverage`                | Unit tests + the coverage gate CI enforces       |
| `pnpm test:e2e`                     | End-to-end tests (Playwright)                    |
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
caps at 300 seconds — less than a full two-marketplace sweep. The Vercel route
is a manual trigger only.

---

## Build status

Phased, with a review checkpoint at the end of each phase.

| Phase | Scope                                                  | State        |
| ----- | ------------------------------------------------------ | ------------ |
| 0     | Repository and guardrails                              | **complete** |
| 1     | Domain core — taxonomy, normalisation, pricing, schema | **complete** |
| 2     | Ingest — adapters, affiliate links, sweep              | next         |
| 3     | The table — facets, duplicate collapse, dispersion     | planned      |
| 4     | SEO surface — ~40 curated landing routes               | planned      |
| 5     | Price history and shucking                             | planned      |
| 6     | Deal alerts                                            | planned      |
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

**Sub-threshold dictionary entries.** Twelve drive families whose recording
technology or NAND type genuinely varies across capacities and production runs
(WD Blue 3.5", WD Red non-Plus, Toshiba P300, Crucial BX500, the Kingston NV
line, the shuckable externals) assert their likely value at a confidence _below_
the publish threshold. They quarantine unless the title states CMR/SMR outright
or a specific model number resolves them. The brief's curated table lists WD
Blue as SMR; that is true of some models and false of others, and publishing a
guess is the failure mode the confidence rule exists to prevent.

---

## Legal

Affiliate disclosures, privacy policy and terms land in Phase 7 and will be
flagged for legal review. Nothing in this repository is legal advice.
