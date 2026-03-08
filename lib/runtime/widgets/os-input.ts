import type { Locator } from '@playwright/test';

export const osInputHandlers: Record<'clear' | 'fill' | 'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async fill(locator: Locator, value = ''): Promise<void> {
    await locator.fill(value);
  },

  async clear(locator: Locator): Promise<void> {
    await locator.fill('');
  },

  async 'get-value'(locator: Locator): Promise<string> {
    return locator.inputValue();
  },
};
