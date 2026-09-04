import { expect, test } from '@playwright/test';

/**
 * Phase 7 — the compliance surface, asserted in a browser.
 *
 * Ticket 7.5 asks specifically for the outbound-link rel and the footer
 * disclosure to be covered by a test. Both are the kind of thing that survives
 * a careless refactor looking fine and quietly stops being true.
 */

const PAGES = ['/', '/hdd/used-enterprise', '/cheapest-per-tb', '/guides'];

test('the required Amazon wording appears on every page', async ({ page }) => {
  // The Operating Agreement requires it verbatim wherever Amazon prices are
  // displayed, which on this site is everywhere.
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('.footer__disclosure')).toContainText(
      'As an Amazon Associate we earn from qualifying purchases.',
    );
  }
});

test('the footer names the eBay programme and links the full disclosure', async ({
  page,
}) => {
  await page.goto('/');
  const footer = page.locator('.footer__disclosure');
  await expect(footer).toContainText('eBay Partner Network');
  await expect(footer.locator('a[href="/legal/affiliate-disclosure"]')).toBeVisible();
});

test('every outbound link carries nofollow sponsored noopener', async ({ page }) => {
  await page.goto('/');

  const links = page.locator('a[target="_blank"]');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const rel = (await links.nth(i).getAttribute('rel')) ?? '';
    const parts = rel.split(/\s+/);
    expect(parts, `link ${i} rel="${rel}"`).toContain('nofollow');
    expect(parts, `link ${i} rel="${rel}"`).toContain('sponsored');
    expect(parts, `link ${i} rel="${rel}"`).toContain('noopener');
  }
});

test('the legal pages render and say they are drafts', async ({ page }) => {
  for (const slug of ['privacy', 'terms', 'affiliate-disclosure']) {
    await page.goto(`/legal/${slug}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.notice')).toContainText('not yet reviewed by a lawyer');
  }
});

test('the guides are server-rendered with their prose intact', async ({ page }) => {
  await page.goto('/guides');
  await expect(page.locator('.guide-list > li')).toHaveCount(3);

  await page.goto('/guides/cmr-vs-smr-and-raid');
  await expect(page.locator('h1')).toContainText('CMR vs SMR');
  // GFM tables are the reason remark-gfm is in the pipeline at all.
  await expect(page.locator('.prose table')).toBeVisible();
  // An internal link inside MDX must become a real anchor, not a bare string.
  // (The related-views rail links there too, hence .first().)
  await expect(page.locator('.prose a[href="/hdd/cmr"]').first()).toBeVisible();
});

test('editorial outbound links are not marked sponsored', async ({ page }) => {
  // A link to Plausible or Backblaze in an article is not an affiliate link,
  // and claiming otherwise is its own kind of false disclosure.
  await page.goto('/legal/privacy');

  const external = page.locator('.prose a[target="_blank"]');
  const count = await external.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const rel = (await external.nth(i).getAttribute('rel')) ?? '';
    expect(rel).toContain('noopener');
    expect(rel).not.toContain('sponsored');
  }
});

test('the sitemap carries the guides and the legal set, and no admin path', async ({
  request,
}) => {
  const xml = await (await request.get('/sitemap.xml')).text();

  expect(xml).toContain('/guides/cmr-vs-smr-and-raid');
  expect(xml).toContain('/legal/privacy');
  expect(xml).not.toContain('/admin');
  expect(xml).not.toContain('/drive/');
});

test('robots disallows the review tool and the per-product pages', async ({
  request,
}) => {
  const body = await (await request.get('/robots.txt')).text();
  expect(body).toContain('Disallow: /admin/');
  expect(body).toContain('Disallow: /drive/');
});

test('the review tool is closed without a password', async ({ request }) => {
  // ADMIN_PASSWORD is unset in CI, and unset must mean CLOSED. An
  // unconfigured deployment must never be an unauthenticated one.
  const response = await request.get('/admin/quarantine');
  expect(response.status()).toBe(401);
  expect(response.headers()['www-authenticate']).toContain('Basic');
});

test('the consent banner does not appear when there is nothing to consent to', async ({
  page,
}) => {
  // NEXT_PUBLIC_PLAUSIBLE_DOMAIN is unset in CI, so no analytics loads and a
  // banner asking permission for that would be theatre.
  await page.goto('/');
  await expect(page.locator('.consent')).toHaveCount(0);
  await expect(page.locator('script[src*="plausible"]')).toHaveCount(0);
});
