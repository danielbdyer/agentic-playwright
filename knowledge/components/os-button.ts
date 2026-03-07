import { Locator } from '@playwright/test';

export const osButton = {
  async click(locator: Locator): Promise<void> {
    await locator.click();
  },

  async getValue(locator: Locator): Promise<string> {
    return locator.innerText();
  },
};
