import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'fs';

// Allow overriding the Chromium binary via env var (CI / custom installs).
// Falls back to a well-known pre-installed path on this dev machine.
// On machines where Playwright manages its own browsers this is undefined and
// Playwright picks up its downloaded build automatically.
const CHROMIUM_EXEC =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // CDN resources (jQuery, Google Fonts) use HTTPS; in some environments
    // the system CA is untrusted. Ignore cert errors so the app boots fully.
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use a pre-installed binary when available; otherwise let Playwright
        // download its own (the default on fresh machines).
        ...(CHROMIUM_EXEC && { launchOptions: { executablePath: CHROMIUM_EXEC } }),
      },
    },
  ],

  // Serves the static app for every test run.
  // `reuseExistingServer: true` lets you keep a server running during
  // development so tests don't restart it on every `npm run test:e2e`.
  webServer: {
    command: 'node tests/server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
