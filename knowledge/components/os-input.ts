import { Locator } from '@playwright/test';

export const osInput = {
  async fill(locator: Locator, value = ''): Promise<void> {
    await locator.fill(value);
  },

  async clear(locator: Locator): Promise<void> {
    await locator.fill('');
  },

  async getValue(locator: Locator): Promise<string> {
    return locator.inputValue();
  },
};
