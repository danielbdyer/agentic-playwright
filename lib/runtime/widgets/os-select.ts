import type { Locator } from '@playwright/test';

function asSelect(locator: Locator): { selectOption?: (value: string) => Promise<void> } {
  return locator as unknown as { selectOption?: (value: string) => Promise<void> };
}

export const osSelectHandlers: Record<'clear' | 'fill' | 'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async fill(locator: Locator, value = ''): Promise<void> {
    const target = asSelect(locator);
    if (typeof target.selectOption === 'function') {
      await target.selectOption(value);
      return;
    }
    await locator.fill(value);
  },

  async clear(locator: Locator): Promise<void> {
    const target = asSelect(locator);
    if (typeof target.selectOption === 'function') {
      await target.selectOption('');
      return;
    }
    await locator.fill('');
  },

  async 'get-value'(locator: Locator): Promise<string> {
    return locator.inputValue();
  },
};
