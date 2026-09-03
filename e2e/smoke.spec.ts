import { expect, test } from '@playwright/test';

/**
 * Phase 0 smoke: the placeholder is served and the harness works in both the
 * JS and no-JS projects.
 *
 * The real no-JS assertion — populated table rows present in the raw HTML —
 * lands with the table at ticket 3.8. The shape of it is here already so the
 * requirement is visible from the start.
 */
test('serves the placeholder page', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('server-renders the build status table without relying on the client', async ({
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
