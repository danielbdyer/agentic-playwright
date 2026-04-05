import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@playwright/test': path.resolve(rootDir, 'tests/support/vitest-playwright-shim.ts'),
    },
  },
  test: {
    include: ['tests/**/*.laws.spec.ts', 'tests/**/*.spec.ts'],
    exclude: [
      'tests/integration/**/*.spec.ts',
      'tests/**/playwright-*.spec.ts',
      'tests/policy-journey-harness.spec.ts',
      'tests/**/*.spec.ts-snapshots/**',
    ],
    reporters: ['default'],
  },
});
