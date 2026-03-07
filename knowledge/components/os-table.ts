import { Locator } from '@playwright/test';
import { createWidgetId } from '../../lib/domain/identity';
import { WidgetCapabilityContract } from '../../lib/domain/types';

export const osTableContract: WidgetCapabilityContract = {
  widget: createWidgetId('os-table'),
  supportedActions: ['get-value'],
  requiredPreconditions: ['visible'],
  sideEffects: {
    'get-value': {
      expectedStates: ['visible'],
      effectCategories: ['observation'],
    },
  },
};

export const osTableHandlers: Record<'get-value', (locator: Locator, value?: string) => Promise<unknown>> = {
  async 'get-value'(locator: Locator): Promise<string> {
    return locator.innerText();
  },
};
