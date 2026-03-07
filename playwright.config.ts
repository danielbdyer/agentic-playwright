import { defineConfig } from '@playwright/test';

const isCheckRun = process.env.TESSERACT_CHECK === '1';
const isCi = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    channel: isCheckRun || isCi ? undefined : 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node fixtures/demo-harness/server.cjs --port 3100',
    url: 'http://127.0.0.1:3100/policy-search.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});