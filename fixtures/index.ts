import { test as base } from '@playwright/test';

interface DemoSession {
  baseURL: string;
}

interface ActivePolicy {
  number: string;
}

export const test = base.extend<{
  demoSession: DemoSession;
  activePolicy: ActivePolicy;
}>({
  demoSession: async ({ baseURL }, use) => {
    if (!baseURL) {
      throw new Error('baseURL is required for the demo harness');
    }

    await use({ baseURL });
  },
  activePolicy: async ({}, use) => {
    await use({ number: 'POL-001' });
  },
});

export { expect } from '@playwright/test';
