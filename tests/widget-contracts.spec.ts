import { expect, test } from '@playwright/test';
import { createWidgetId } from '../lib/domain/identity';
import { widgetCapabilityContracts } from '../lib/domain/widgets/contracts';
import { interact } from '../lib/runtime/interact';
import { resolveLocator } from '../lib/runtime/locate';

const osSelectWidgetId = createWidgetId('os-select');
const osToggleWidgetId = createWidgetId('os-toggle');

test('os-select contract codifies expected affordances and preconditions', () => {
  const contract = widgetCapabilityContracts[osSelectWidgetId];

  expect(contract).toBeDefined();
  expect(contract?.supportedActions).toEqual(['fill', 'clear', 'get-value']);
  expect(contract?.requiredPreconditions).toEqual(['enabled', 'visible']);
  expect(contract?.sideEffects.fill?.effectCategories).toEqual(['mutation']);
  expect(contract?.sideEffects['get-value']?.effectCategories).toEqual(['observation']);
});

test('os-toggle contract codifies expected affordances and preconditions', () => {
  const contract = widgetCapabilityContracts[osToggleWidgetId];

  expect(contract).toBeDefined();
  expect(contract?.supportedActions).toEqual(['click', 'get-value']);
  expect(contract?.requiredPreconditions).toEqual(['enabled', 'visible']);
  expect(contract?.sideEffects.click?.effectCategories).toEqual(['mutation']);
  expect(contract?.sideEffects['get-value']?.effectCategories).toEqual(['observation']);
});

test('os-select failure mode remains stable for unsupported action', async () => {
  const locator = {
    isEnabled: async () => true,
    isVisible: async () => true,
    click: async () => undefined,
    fill: async () => undefined,
  };

  const result = await interact(locator as never, osSelectWidgetId, 'click');
  expect(result.ok).toBeFalsy();
  if (!result.ok) {
    expect(result.error.code).toBe('runtime-missing-action-handler');
    expect(result.error.message).toBe('No click action registered for os-select');
  }
});

test('resolver marks fallback locator rung as degraded for new widget families', async () => {
  const primaryLocator = {
    count: async () => 0,
    or: () => primaryLocator,
  };
  const fallbackLocator = {
    count: async () => 1,
    or: () => fallbackLocator,
  };
  const page = {
    getByTestId: () => primaryLocator,
    getByRole: () => fallbackLocator,
    locator: () => fallbackLocator,
  };

  const resolved = await resolveLocator(page as never, {
    role: 'combobox',
    name: 'Status',
    testId: 'status-select',
    locator: [
      { kind: 'test-id', value: 'status-select' },
      { kind: 'role-name', role: 'combobox', name: 'Status' },
    ],
    surface: 'search-form' as never,
    widget: osSelectWidgetId,
  });

  expect(resolved.strategy.kind).toBe('role-name');
  expect(resolved.strategyIndex).toBe(1);
  expect(resolved.degraded).toBeTruthy();
});
