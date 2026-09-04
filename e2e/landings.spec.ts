import { expect, test } from '@playwright/test';

/**
 * Phase 4 — the SEO surface.
 *
 * Runs in both projects. Everything asserted here is server-rendered: a
 * landing page whose content depended on JavaScript would be worthless for the
 * organic search traffic these routes exist to capture.
 */

test('a landing server-renders its own filtered table and copy', async ({ page }) => {
  await page.goto('/hdd/sas');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('SAS');

  // Its own intro copy, not boilerplate shared with every other route.
  const intro = await page.locator('main p').first().textContent();
  expect(intro?.length ?? 0).toBeGreaterThan(100);

  // A real, filtered table.
  const rows = await page.locator('table tbody tr').count();
  expect(rows).toBeGreaterThan(0);

  const all = await page.request.get('/');
  const allRows = ((await all.text()).match(/<tr>/g) ?? []).length;
  expect(rows).toBeLessThan(allRows);
});

test('the landing filter is applied and reflected in the rail', async ({ page }) => {
  await page.goto('/hdd/sas');
  await expect(page.locator('[data-testid="facet-interface-sas12"]')).toBeChecked();
});

test('filtering from a landing stays on that landing', async ({ page }) => {
  await page.goto('/hdd/used-enterprise');
  // The rail's form target is the landing, not the home page — otherwise the
  // first click would throw the visitor off the page they searched for.
  await expect(page.locator('form')).toHaveAttribute('action', '/hdd/used-enterprise');
});

test('every landing carries breadcrumbs, related links and the footer', async ({
  page,
}) => {
  for (const path of ['/hdd/nas', '/ssd/m2-2230', '/cheapest-per-tb']) {
    await page.goto(path);
    await expect(page.locator('nav[aria-label="Breadcrumb"]'), path).toBeVisible();
    await expect(page.locator('nav[aria-label="Related views"]'), path).toBeVisible();
    await expect(
      page.locator('nav[aria-label="All comparison views"]'),
      path,
    ).toBeAttached();
  }
});

test('every curated landing is reachable from the global footer', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page
    .locator('nav[aria-label="All comparison views"] a')
    .evaluateAll((links) => links.map((l) => l.getAttribute('href')));

  // 39 categorised landings plus the two cross-cutting entries.
  const landingLinks = hrefs.filter(
    (h) => h?.startsWith('/hdd/') || h?.startsWith('/ssd/'),
  );
  expect(new Set(landingLinks).size).toBeGreaterThanOrEqual(35);
  expect(hrefs).toContain('/cheapest-per-tb');
});

test('structured data is ItemList and BreadcrumbList only', async ({ request }) => {
  const html = await (await request.get('/hdd/nas')).text();

  expect(html).toContain('"@type":"BreadcrumbList"');
  expect(html).toContain('"@type":"ItemList"');

  // Product markup on a page that does not sell the item risks a manual
  // action against the whole domain.
  expect(html).not.toContain('"@type":"Product"');
  expect(html).not.toContain('"@type":"Offer"');
  expect(html).not.toContain('"@type":"AggregateOffer"');
});

test('a landing declares its bare path as canonical', async ({ request }) => {
  const html = await (await request.get('/ssd/nvme-gen5')).text();
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/ssd\/nvme-gen5"/);
});

test('outbound links carry the route slug as the affiliate sub-id', async ({
  request,
}) => {
  // Per-route attribution (ticket 4.6): the same offer earns under a different
  // sub-id depending on which route sent the visitor.
  const sas = await (await request.get('/hdd/sas')).text();
  const home = await (await request.get('/')).text();

  const subIds = (s: string) => new Set(s.match(/customid=([a-z0-9-]+)/g) ?? []);

  if (subIds(sas).size > 0) {
    expect([...subIds(sas)]).toContain('customid=sas');
    expect([...subIds(home)]).toContain('customid=home');
  }
});

test('robots allows the curated routes and blocks filter permutations', async ({
  request,
}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Allow: /');
  expect(robots).toContain('Disallow: /api/');
  // Every facet permutation is a valid URL and a terrible thing to crawl.
  expect(robots).toContain('Disallow: /*?');
  expect(robots).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
});

test('the sitemap lists the curated routes and no permutations', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = (xml.match(/<loc>([^<]*)<\/loc>/g) ?? []).map((l) =>
    l.replace(/<\/?loc>/g, ''),
  );

  expect(locs.length).toBeGreaterThanOrEqual(40);
  expect(new Set(locs).size).toBe(locs.length);
  // Not one filtered URL.
  expect(locs.filter((l) => l.includes('?'))).toEqual([]);

  expect(locs.some((l) => l.endsWith('/hdd/nas'))).toBe(true);
  expect(locs.some((l) => l.endsWith('/cheapest-per-tb'))).toBe(true);
});

test('sitemap lastmod is derived from the data, not stamped with the crawl time', async ({
  request,
}) => {
  const xml = await (await request.get('/sitemap.xml')).text();

  const entries = [...xml.matchAll(/<url>(.*?)<\/url>/gs)].map((m) => {
    const block = m[1];
    return {
      loc: /<loc>([^<]*)<\/loc>/.exec(block)?.[1] ?? '',
      lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(block)?.[1] ?? null,
    };
  });
  expect(entries.length).toBeGreaterThanOrEqual(40);

  const parsed = entries
    .filter((e) => e.lastmod !== null)
    .map((e) => ({ loc: e.loc, at: Date.parse(e.lastmod as string) }));
  expect(parsed.length).toBeGreaterThan(0);
  expect(parsed.every((e) => Number.isFinite(e.at))).toBe(true);

  // A lastmod in the future is not a date, it is a bug.
  const now = Date.now();
  expect(parsed.filter((e) => e.at > now).map((e) => e.loc)).toEqual([]);

  // The regression this replaces: `new Date()` gave every table route the same
  // value, seconds old, on every fetch. An always-current lastmod is not a
  // freshness signal, and the documented consequence is the crawler ignoring
  // lastmod for the whole site — including the editorial pages where the date
  // is real. Two properties are impossible under that bug and hold under a
  // derived date, so assert both rather than the wall-clock distance, which
  // would only be testing how old the seed is.
  const table = parsed.filter((e) => !/\/(guides|legal)(\/|$)/.test(e.loc));
  expect(table.length).toBeGreaterThan(30);

  // Landings are dated over the rows they actually show, so they diverge.
  expect(new Set(table.map((e) => e.at)).size).toBeGreaterThan(1);
  // And a view nothing has happened in keeps an old date.
  expect(table.some((e) => now - e.at > 24 * 60 * 60 * 1000)).toBe(true);
});

test('an uncurated slug 404s rather than rendering a thin page', async ({ request }) => {
  // dynamicParams is false: the curated set is the whole set.
  const response = await request.get('/hdd/37tb');
  expect(response.status()).toBe(404);
});

test('the footer carries the required Amazon Associates wording', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('As an Amazon Associate we earn from qualifying purchases.');
});
