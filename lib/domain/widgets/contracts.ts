import { createWidgetId } from '../kernel/identity';
import type { WidgetCapabilityContract } from '../types/widgets';

export type WidgetContractRegistry = Record<string, WidgetCapabilityContract>;

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

export const widgetCapabilityContracts: WidgetContractRegistry = {
  [osButtonContract.widget]: osButtonContract,
  [osInputContract.widget]: osInputContract,
  [osTableContract.widget]: osTableContract,
};
