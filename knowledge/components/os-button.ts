import { Locator } from '@playwright/test';
import { createWidgetId } from '../../lib/domain/identity';
import { WidgetCapabilityContract } from '../../lib/domain/types';

export const osButtonContract: WidgetCapabilityContract = {
  widget: createWidgetId('os-button'),
  supportedActions: ['click', 'get-value'],
  requiredPreconditions: ['enabled', 'visible'],
  sideEffects: {
    click: {
      expectedStates: ['enabled', 'visible'],
      effectCategories: ['mutation'],
    },
    'get-value': {
      expectedStates: ['visible'],
      effectCategories: ['observation'],
    },
  },
};

export const osButtonHandlers: Record<'click' | 'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async click(locator: Locator): Promise<void> {
    await locator.click();
  },

  async 'get-value'(locator: Locator): Promise<string> {
    return locator.innerText();
  },
};
