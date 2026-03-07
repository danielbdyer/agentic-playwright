import type { Locator } from '@playwright/test';
import { createWidgetId } from '../../lib/domain/identity';
import type { WidgetCapabilityContract } from '../../lib/domain/types';

export const osInputContract: WidgetCapabilityContract = {
  widget: createWidgetId('os-input'),
  supportedActions: ['clear', 'fill', 'get-value'],
  requiredPreconditions: ['editable', 'enabled', 'visible'],
  sideEffects: {
    fill: {
      expectedStates: ['enabled', 'visible'],
      effectCategories: ['mutation'],
    },
    clear: {
      expectedStates: ['enabled', 'visible'],
      effectCategories: ['mutation'],
    },
    'get-value': {
      expectedStates: ['visible'],
      effectCategories: ['observation'],
    },
  },
};

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
