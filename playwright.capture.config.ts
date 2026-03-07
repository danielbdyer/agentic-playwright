import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests-capture',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3102',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
  },
  webServer: {
    command: 'node fixtures/demo-harness/server.cjs --port 3102',
    url: 'http://127.0.0.1:3102/policy-search.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
