import type { Locator } from '@playwright/test';
import { missingActionHandlerError, widgetPreconditionError } from '../../domain/kernel/errors';
import type { WidgetInteractionContext, WidgetPrecondition } from '../../domain/knowledge/widget-types';
import { affordancesForRole, type RoleAffordance } from '../../domain/widgets/role-affordances';
import { widgetCapabilityContracts } from '../../domain/widgets/contracts';
import { widgetActionHandlers } from './index';
import type { RuntimeResult} from '../result';
import { runtimeErr, runtimeOk } from '../result';

async function assertPrecondition(locator: Locator, precondition: WidgetPrecondition): Promise<RuntimeResult<void>> {
  switch (precondition) {
    case 'visible':
      if (!(await locator.isVisible())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr('runtime-widget-precondition-failed', error.message, error.context, error);
      }
      return runtimeOk(undefined);
    case 'enabled':
      if (!(await locator.isEnabled())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr('runtime-widget-precondition-failed', error.message, error.context, error);
      }
      return runtimeOk(undefined);
    case 'editable':
      if (!(await locator.isEditable())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr('runtime-widget-precondition-failed', error.message, error.context, error);
      }
      return runtimeOk(undefined);
  }
}

// ---------------------------------------------------------------------------
// Widget-to-role mapping (deterministic, derived from naming convention)
// ---------------------------------------------------------------------------

const WIDGET_TO_ROLE: Readonly<Record<string, string>> = {
  'os-button': 'button',
  'os-input': 'textbox',
  'os-textarea': 'textbox',
  'os-table': 'table',
  'os-select': 'combobox',
  'os-checkbox': 'checkbox',
  'os-radio': 'radio',
  'os-link': 'link',
  'os-region': 'dialog',
} as const;

function widgetToRole(widget: string): string | null {
  return WIDGET_TO_ROLE[widget] ?? null;
}

// ---------------------------------------------------------------------------
// Role-based dispatcher — executes an affordance via Playwright
// ---------------------------------------------------------------------------

async function executeAffordance(
  locator: Locator,
  affordance: RoleAffordance,
  value?: string,
): Promise<void> {
  const loc = locator as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  if (affordance.args === 'value') {
    await loc[affordance.method](value ?? '');
  } else {
    await loc[affordance.method]();
  }
}

async function interactByRole(
  locator: Locator,
  role: string,
  action: string,
  value?: string,
): Promise<RuntimeResult<void>> {
  const affordances = affordancesForRole(role);
  const affordance = affordances.find((a) => a.action === action);
  if (!affordance) {
    const error = missingActionHandlerError(role, action);
    return runtimeErr('runtime-missing-action-handler', error.message, error.context, error);
  }

  for (const precondition of affordance.preconditions) {
    const preconditionResult = await assertPrecondition(locator, precondition);
    if (!preconditionResult.ok) {
      return preconditionResult;
    }
  }

  await executeAffordance(locator, affordance, value);
  return runtimeOk(undefined);
}

// ---------------------------------------------------------------------------
// Public API — backward-compatible with role-based fallback
// ---------------------------------------------------------------------------

export async function interact(
  locator: Locator,
  widget: string,
  action: string,
  value?: string,
  context?: WidgetInteractionContext,
): Promise<RuntimeResult<void>> {
  // Path 1: Legacy hand-authored handler (backward compatible)
  const contract = widgetCapabilityContracts[widget];
  const handlers = widgetActionHandlers[widget];
  const handler = handlers?.[action];
  if (contract && handler && contract.supportedActions.includes(action as never)) {
    for (const precondition of contract.requiredPreconditions) {
      const preconditionResult = await assertPrecondition(locator, precondition);
      if (!preconditionResult.ok) {
        return preconditionResult;
      }
    }
    await handler(locator, value, context);
    return runtimeOk(undefined);
  }

  // Path 2: Role-based dispatch via affordance table
  const role = widgetToRole(widget);
  if (role) {
    return interactByRole(locator, role, action, value);
  }

  // Path 3: Direct role string (when widget IS the role)
  const directAffordances = affordancesForRole(widget);
  if (directAffordances.length > 0) {
    return interactByRole(locator, widget, action, value);
  }

  const error = missingActionHandlerError(widget, action);
  return runtimeErr('runtime-missing-action-handler', error.message, error.context, error);
}
