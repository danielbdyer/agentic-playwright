import type { Locator } from '@playwright/test';

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

export const osToggleHandlers: Record<'click' | 'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async click(locator: Locator, value?: string): Promise<void> {
    if (value === undefined) {
      await locator.click();
      return;
    }

    const current = await locator.getAttribute('aria-checked').catch(() => null);
    const currentChecked = toBoolean(current);
    const targetChecked = toBoolean(value);
    if (currentChecked !== targetChecked) {
      await locator.click();
    }
  },

  async 'get-value'(locator: Locator): Promise<string> {
    return (await locator.getAttribute('aria-checked')) ?? 'false';
  },
};
