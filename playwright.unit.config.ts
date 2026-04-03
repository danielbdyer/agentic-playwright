import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['**/*.spec.ts'],
  testIgnore: ['**/playwright-*.spec.ts', '**/policy-journey-harness.spec.ts'],
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
});
