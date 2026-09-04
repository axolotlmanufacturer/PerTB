import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * Escape hatch for environments that already ship a Chromium and cannot run
 * `playwright install` — some hardened CI images, and sandboxes that pin a
 * browser build older than the one this Playwright version downloads.
 *
 * Unset (the normal case, including our own CI) Playwright uses the browser it
 * manages itself, which is the version this config is tested against.
 */
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const launchOptions = chromiumExecutable
  ? { launchOptions: { executablePath: chromiumExecutable } }
  : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...launchOptions },
    },
    {
      /*
       * The page must be complete and correct with JavaScript disabled
       * (brief §6). Ticket 3.8 curls the page and asserts populated table
       * markup; this project is the browser-side half of the same guarantee
       * and exists from Phase 0 so it cannot be retrofitted and forgotten.
       */
      name: 'chromium-nojs',
      use: { ...devices['Desktop Chrome'], ...launchOptions, javaScriptEnabled: false },
    },
  ],

  webServer: {
    // In CI the build is its own pipeline step, so we serve the built output —
    // that is what Googlebot and users actually get. Locally, `dev` keeps the
    // feedback loop short.
    command: isCI ? 'pnpm start' : 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
