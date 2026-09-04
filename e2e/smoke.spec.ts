import { expect, test } from '@playwright/test';

/**
 * Smoke: the page is served and the harness works in both the JS and no-JS
 * projects. The substantive table assertions live in table.spec.ts.
 */
test('serves the table page', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('server-renders the comparison table without relying on the client', async ({
  page,
}) => {
  await page.goto('/');

  const table = page.getByRole('table');
  await expect(table).toBeVisible();

  // Rows must come from the server. This passes in the chromium-nojs project
  // only because the markup is in the initial HTML.
  const rows = table.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
});
