import type { Locator } from '@playwright/test';

export const osTableHandlers: Record<'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async 'get-value'(locator: Locator): Promise<string> {
    return locator.innerText();
  },
};
