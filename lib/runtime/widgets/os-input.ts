import type { Locator } from '@playwright/test';

export const osInputHandlers: Record<'clear' | 'fill' | 'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async fill(locator: Locator, value = ''): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill(), not Array.fill()
    await locator.fill(value);
  },

  async clear(locator: Locator): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- Playwright Locator.fill(), not Array.fill()
    await locator.fill('');
  },

  async 'get-value'(locator: Locator): Promise<string> {
    return locator.inputValue();
  },
};
