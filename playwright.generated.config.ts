import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'generated',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3101',
    browserName: 'chromium',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node fixtures/demo-harness/server.cjs --port 3101',
    url: 'http://127.0.0.1:3101/policy-search.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
