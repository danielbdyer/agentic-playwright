import { createWidgetId } from '../kernel/identity';
import type { WidgetCapabilityContract } from '../knowledge/widget-types';
import {
  LEGACY_WIDGET_ROLE_BRIDGE,
  affordancesForRole,
  roleForWidget,
} from './role-affordances';

export type WidgetContractRegistry = Record<string, WidgetCapabilityContract>;

function uniqueOrdered<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function deriveContractForWidget(widget: string): WidgetCapabilityContract | null {
  const role = roleForWidget(widget);
  if (!role) {
    return null;
  }

  const affordances = affordancesForRole(role);
  if (affordances.length === 0) {
    return null;
  }

  return {
    widget: createWidgetId(widget),
    supportedActions: uniqueOrdered(affordances.map((affordance) => affordance.action)),
    requiredPreconditions: uniqueOrdered(
      affordances.flatMap((affordance) => affordance.preconditions),
    ),
    sideEffects: Object.fromEntries(
      affordances.map((affordance) => [
        affordance.action,
        {
          expectedStates: uniqueOrdered(
            affordance.preconditions.filter((state) => state === 'visible' || state === 'enabled'),
          ),
          effectCategories: [affordance.effectCategory],
        },
      ]),
    ),
  };
}

const derivedContracts = Object.keys(LEGACY_WIDGET_ROLE_BRIDGE)
  .sort((left, right) => left.localeCompare(right))
  .flatMap((widget) => {
    const contract = deriveContractForWidget(widget);
    return contract ? [[widget, contract] as const] : [];
  });

export const widgetCapabilityContracts: WidgetContractRegistry = Object.fromEntries(derivedContracts);

export const osButtonContract = widgetCapabilityContracts['os-button']!;
export const osInputContract = widgetCapabilityContracts['os-input']!;
export const osTableContract = widgetCapabilityContracts['os-table']!;
