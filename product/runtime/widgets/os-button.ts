import type { Locator } from '@playwright/test';

export const osButtonHandlers: Record<'click' | 'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async click(locator: Locator): Promise<void> {
    await locator.click();
  },

  async 'get-value'(locator: Locator): Promise<string> {
    return locator.innerText();
  },
};
