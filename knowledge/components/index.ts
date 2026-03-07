import { Locator } from '@playwright/test';
import { WidgetCapabilityContract } from '../../lib/domain/types';
import { validateWidgetCapabilityContract } from '../../lib/domain/validation';
import { osButtonContract, osButtonHandlers } from './os-button';
import { osInputContract, osInputHandlers } from './os-input';
import { osTableContract, osTableHandlers } from './os-table';

const contracts = [
  validateWidgetCapabilityContract(osButtonContract, 'knowledge/components/os-button.ts'),
  validateWidgetCapabilityContract(osInputContract, 'knowledge/components/os-input.ts'),
  validateWidgetCapabilityContract(osTableContract, 'knowledge/components/os-table.ts'),
] as const;

export const widgetCapabilityContracts: Record<string, WidgetCapabilityContract> = Object.fromEntries(
  contracts.map((contract) => [contract.widget, contract]),
);

export const widgetActionHandlers: Record<string, Record<string, (locator: Locator, value?: string) => Promise<unknown>>> = {
  'os-button': osButtonHandlers,
  'os-input': osInputHandlers,
  'os-table': osTableHandlers,
};
