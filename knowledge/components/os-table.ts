import { Locator } from '@playwright/test';

export const osTable = {
  async getValue(locator: Locator): Promise<string> {
    return locator.innerText();
  },
};
