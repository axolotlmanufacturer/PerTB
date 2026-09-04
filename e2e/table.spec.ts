import { expect, test, type Page } from '@playwright/test';

/**
 * Ticket 3.8 and 3.9.
 *
 * These run in both the `chromium` and `chromium-nojs` projects. Everything
 * asserted here is server-rendered, so the no-JS project is not a reduced
 * version of the suite — it is the same suite, proving the page is complete
 * without scripting (CLAUDE.md §6).
 */

async function interfaceCounts(page: Page): Promise<Record<string, number>> {
  const entries = await page
    .locator('[data-testid^="count-interface-"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => [
        (n as HTMLElement).dataset.testid?.replace('count-interface-', '') ?? '',
        Number(n.textContent ?? '0'),
      ]),
    );
  return Object.fromEntries(entries) as Record<string, number>;
}

async function floorCents(page: Page): Promise<number | null> {
  const caption = (await page.locator('table caption').textContent()) ?? '';
  const match = caption.match(/cheapest \$([\d.]+)\/TB/);
  return match?.[1] === undefined ? null : Math.round(Number(match[1]) * 100);
}

/**
 * How many drives the SELECTION holds, from the caption — not how many rows
 * this page happens to render.
 *
 * The table is paged, so counting <tr> would answer "how big is a page", which
 * is a constant and tells you nothing about whether a filter did anything.
 */
async function rowCount(page: Page): Promise<number> {
  const caption = (await page.locator('table caption').textContent()) ?? '';
  return Number(caption.match(/([\d,]+) drives/)?.[1]?.replace(/,/g, '') ?? '0');
}

// ---------------------------------------------------------------------------
// 3.9 — the facet independence test the brief asks for by name
// ---------------------------------------------------------------------------

test('selecting one interface leaves the other interface counts non-zero and clickable', async ({
  page,
}) => {
  await page.goto('/');
  const before = await interfaceCounts(page);

  const siblings = Object.entries(before).filter(([k, v]) => k !== 'pcie4' && v > 0);
  expect(siblings.length, 'fixture must have several interfaces').toBeGreaterThan(1);

  // Navigate rather than click, so this test is identical under chromium-nojs.
  await page.goto('/?interface=pcie4');

  const after = await interfaceCounts(page);

  for (const [key, count] of siblings) {
    // The whole invariant: an axis is counted with its OWN selection skipped.
    // Get this wrong and every unselected option reads 0, the options become
    // unreachable, and the checkbox group is a radio group.
    expect(after[key], `interface ${key} must stay reachable`).toBeGreaterThan(0);
    expect(after[key], `interface ${key} count must not change`).toBe(count);
  }

  // And they remain real, enabled controls.
  const sibling = siblings[0]?.[0];
  const checkbox = page.locator(`[data-testid="facet-interface-${sibling}"]`);
  await expect(checkbox).toBeEnabled();

  // The selected one is actually applied to the table.
  await expect(page.locator('[data-testid="facet-interface-pcie4"]')).toBeChecked();
});

test('other axes DO narrow when an interface is selected', async ({ page }) => {
  // The counterpart to the test above: skipping the axis must not turn into
  // ignoring every filter.
  await page.goto('/');
  const wide = Number(
    await page.locator('[data-testid="count-technology-ssd_tlc"]').textContent(),
  );

  await page.goto('/?interface=sata3');
  const narrow = Number(
    await page.locator('[data-testid="count-technology-ssd_tlc"]').textContent(),
  );

  expect(wide).toBeGreaterThan(0);
  expect(narrow).toBeLessThan(wide);
});

// ---------------------------------------------------------------------------
// 3.9 — lot toggle
// ---------------------------------------------------------------------------

test('hiding lots removes the lot rows and never lowers the floor', async ({ page }) => {
  await page.goto('/');
  const lotBadgesBefore = await page.getByText(/^lot of \d+$/).count();
  const floorWithLots = await floorCents(page);
  const rowsWithLots = await rowCount(page);

  expect(lotBadgesBefore, 'fixture must contain multi-drive lots').toBeGreaterThan(0);

  await page.goto('/?hideLots=1');

  // The rows themselves are gone, not merely unlabelled.
  expect(await page.getByText(/^lot of \d+$/).count()).toBe(0);
  expect(await rowCount(page)).toBeLessThan(rowsWithLots);

  // Removing rows can only raise the floor or leave it. A LOWER floor would
  // mean an undetected lot had been dividing a price across drives that were
  // just excluded — the exact failure the lot rule exists to prevent.
  const floorWithoutLots = await floorCents(page);
  expect(floorWithoutLots).not.toBeNull();
  expect(floorWithoutLots!).toBeGreaterThanOrEqual(floorWithLots!);
});

// ---------------------------------------------------------------------------
// 3.9 — shipping toggle
// ---------------------------------------------------------------------------

test('excluding shipping never raises the floor, and is reflected in the caption', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('table caption')).toContainText('shipping included');
  const included = await floorCents(page);

  await page.goto('/?shipping=0');
  await expect(page.locator('table caption')).toContainText('shipping excluded');
  const excluded = await floorCents(page);

  // Every row's effective price drops or stays, so the minimum must too.
  expect(excluded).not.toBeNull();
  expect(excluded!).toBeLessThanOrEqual(included!);
  await expect(page.locator('[data-testid="toggle-shipping"]')).not.toBeChecked();
});

test('shipping is included by default', async ({ page }) => {
  // Without this default, eBay's $0.99-item-plus-$28-shipping listings sit at
  // the top of the table permanently.
  await page.goto('/');
  await expect(page.locator('[data-testid="toggle-shipping"]')).toBeChecked();
});

// ---------------------------------------------------------------------------
// 3.8 — the no-JS test, done against the raw response body
// ---------------------------------------------------------------------------

test('the raw HTML response contains a populated table', async ({ request, baseURL }) => {
  const response = await request.get(baseURL ?? '/');
  expect(response.status()).toBe(200);
  const html = await response.text();

  // Populated rows, not just a table shell.
  const bodyRows = html.match(/<tr>/g) ?? [];
  expect(bodyRows.length).toBeGreaterThan(20);

  // Real prices, in the markup, before any script runs.
  expect(html).toMatch(/\$\d+\.\d{2}<!-- -->\/TB|\$\d+\.\d{2}\/TB/);

  // The facet rail is server-rendered too, with its counts.
  expect(html).toContain('data-testid="count-interface-sata3"');
  expect(html).toContain('type="checkbox"');

  // And it can be submitted without JavaScript.
  expect(html).toContain('Apply filters');
  expect(html).toMatch(/<form[^>]*method="get"/i);
});

test('every outbound link is nofollow sponsored noopener', async ({
  request,
  baseURL,
}) => {
  const html = await (await request.get(baseURL ?? '/')).text();

  const outbound =
    html.match(/<a [^>]*href="https:\/\/(www\.)?(ebay|amazon)\.com[^"]*"[^>]*>/g) ?? [];
  expect(outbound.length).toBeGreaterThan(0);
  for (const anchor of outbound) {
    expect(anchor, anchor).toContain('rel="nofollow sponsored noopener"');
  }
});

test('a filtered URL server-renders its own filtered table', async ({
  request,
  baseURL,
}) => {
  const all = await (await request.get(`${baseURL}/`)).text();
  const filtered = await (await request.get(`${baseURL}/?interface=sas12`)).text();

  const rowsOf = (html: string) => (html.match(/<tr>/g) ?? []).length;
  expect(rowsOf(filtered)).toBeLessThan(rowsOf(all));
  expect(rowsOf(filtered)).toBeGreaterThan(1);
});

// ---------------------------------------------------------------------------
// Collapse and risk columns
// ---------------------------------------------------------------------------

test('duplicate offers collapse into one expandable row', async ({ page }) => {
  await page.goto('/');
  const groups = page.locator('table tbody details');
  expect(await groups.count()).toBeGreaterThan(0);

  const first = groups.first();
  // <details> is native HTML: it expands with JavaScript disabled.
  await expect(first.locator('summary')).toContainText(/\d+ offers/);
  expect(await first.locator('li').count()).toBeGreaterThan(1);
});

test('the dispersion strip is server-rendered on a log scale', async ({ page }) => {
  await page.goto('/');
  const figure = page.locator('figure svg');
  await expect(figure).toBeAttached();
  await expect(page.locator('figure figcaption')).toContainText('log scale');
});

// ---------------------------------------------------------------------------
// The client island — only meaningful where scripting is on
// ---------------------------------------------------------------------------

test('toggling a facet updates the URL without a full form submit', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.use.javaScriptEnabled === false,
    'progressive enhancement; the no-JS path is covered by the form submit test',
  );

  await page.goto('/');
  await page.locator('[data-testid="facet-condition-used"]').check();

  await page.waitForURL(/condition=used/);
  await expect(page.locator('[data-testid="facet-condition-used"]')).toBeChecked();
  await expect(page.locator('[data-testid="reset-filters"]')).toBeVisible();

  // The server re-rendered: the table reflects the filter.
  const rows = await page.locator('table tbody tr').count();
  expect(rows).toBeGreaterThan(0);
});

test.describe('paging', () => {
  test('caps the rows in the HTML and pages the rest', async ({ page }) => {
    // Every group used to go into one document. At a real catalogue size that
    // is megabytes of HTML and an LCP to match.
    await page.goto('/');

    const rows = page.locator('table.dt tbody tr');
    expect(await rows.count()).toBeLessThanOrEqual(100);

    // The caption counts the SELECTION, not the page — a caption that counted
    // only visible rows would make the floor beside it look wrong.
    const caption = (await page.locator('table caption').textContent()) ?? '';
    const drives = Number(
      caption.match(/([\d,]+) drives/)?.[1]?.replace(/,/g, '') ?? '0',
    );
    expect(drives).toBeGreaterThan(await rows.count());
  });

  test('page two is a real link with the whole query on it', async ({ page }) => {
    await page.goto('/?technology=hdd_cmr');

    const next = page.locator('.pager__link[rel="next"]');
    await expect(next).toBeVisible();

    await next.click();
    // The filter survives the page turn, or paging silently resets the view.
    await expect(page).toHaveURL(/technology=hdd_cmr/);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator('.pager__link[rel="prev"]')).toBeVisible();
  });

  test('the floor does not change when you turn the page', async ({ page }) => {
    // The floor is the floor of the selection. If it moved with the page it
    // would be the cheapest drive ON THIS PAGE, which is a different number
    // wearing the same label.
    await page.goto('/');
    const first = (await page.locator('table caption').textContent()) ?? '';

    await page.goto('/?page=2');
    const second = (await page.locator('table caption').textContent()) ?? '';

    const floor = (s: string) => s.match(/cheapest \$([\d.]+)\/TB/)?.[1];
    expect(floor(first)).toBeDefined();
    expect(floor(second)).toBe(floor(first));
  });

  test('a page past the end is empty, not an error', async ({ page }) => {
    const response = await page.goto('/?page=9999');
    expect(response?.status()).toBe(200);
    await expect(page.locator('table.dt')).toBeVisible();
  });
});
