import { expect, test } from '@playwright/test';

/**
 * Phase 5 — price history in the browser.
 *
 * Like every other spec here, these run in the `chromium-nojs` project too.
 * The sparklines are server-rendered inline SVG and the detail view is a plain
 * Server Component, so nothing in this file should behave differently with
 * scripting off — which is exactly what running it twice proves.
 */

test('the table carries a 90-day history column in the initial HTML', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('columnheader', { name: '90 days' })).toBeVisible();

  // Server-rendered SVG, present before any script runs.
  const sparklines = page.locator('svg.spark');
  expect(await sparklines.count()).toBeGreaterThan(0);

  // A real path, not an empty placeholder.
  const d = await page.locator('svg.spark path.spark__line').first().getAttribute('d');
  expect(d).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/);
});

test('every history cell links through to that drive', async ({ page }) => {
  await page.goto('/');

  const link = page.locator('a[href^="/drive/"]').first();
  await expect(link).toHaveAttribute('href', /^\/drive\/[a-z0-9]+\?condition=\w+$/);
});

test('the detail view shows the chart and the offers behind a row', async ({ page }) => {
  await page.goto('/');

  const href = await page.locator('a.spark-cell').first().getAttribute('href');
  expect(href).toBeTruthy();

  await page.goto(href!);

  await expect(page.locator('svg.chart')).toBeVisible();
  await expect(page.getByText('Now', { exact: true })).toBeVisible();

  // Outbound links on this page are tagged with their own sub-id, and carry
  // the required rel (ticket 7.5 asserts the wording; this asserts presence).
  const outbound = page.locator('a[target="_blank"]').first();
  await expect(outbound).toHaveAttribute('rel', /nofollow/);
});

test('the detail view is kept out of the index', async ({ page }) => {
  // Its URL is a database id and its content expires within hours. Letting
  // Google index a few thousand of these would bury the curated routes.
  await page.goto('/');
  const href = await page.locator('a.spark-cell').first().getAttribute('href');
  await page.goto(href!);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('an unknown drive is a 404, not an empty page', async ({ page }) => {
  const response = await page.goto('/drive/does-not-exist');
  expect(response?.status()).toBe(404);
});

test('a cheapest-in-N-days badge never claims more than the window observed', async ({
  page,
}) => {
  await page.goto('/');

  const badges = page.locator('.chip--good', { hasText: /^\d+d low$/ });
  const count = await badges.count();

  for (let i = 0; i < Math.min(count, 25); i++) {
    const text = (await badges.nth(i).textContent()) ?? '';
    const days = Number(text.match(/(\d+)d low/)?.[1] ?? '0');
    // The window is 90 days and the floor for making the claim at all is 7.
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThanOrEqual(90);
  }
});
