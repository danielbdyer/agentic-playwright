import { defineConfig } from '@playwright/test';
import { resolvePlaywrightHeadless, resolvePreferredPlaywrightChannel } from './lib/infrastructure/tooling/browser-options';

const defaultWorkers = parseInt(process.env.TESSERACT_TEST_WORKERS ?? '', 10);

export default defineConfig({
  testDir: 'tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: true,
  ...Number.isFinite(defaultWorkers) ? { workers: defaultWorkers } : {},
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    channel: resolvePreferredPlaywrightChannel(process.env),
    headless: resolvePlaywrightHeadless(process.env),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node dogfood/fixtures/demo-harness/server.cjs --port 3100',
    url: 'http://127.0.0.1:3100/policy-search.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
