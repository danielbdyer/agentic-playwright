import { defineConfig } from '@playwright/test';
import { resolvePlaywrightHeadless, resolvePreferredPlaywrightChannel } from './lib/infrastructure/tooling/browser-options';

export default defineConfig({
  testDir: 'tests-capture',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3102',
    browserName: 'chromium',
    channel: resolvePreferredPlaywrightChannel(process.env),
    headless: resolvePlaywrightHeadless(process.env),
  },
  webServer: {
    command: 'node dogfood/fixtures/demo-harness/server.cjs --port 3102',
    url: 'http://127.0.0.1:3102/policy-search.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
