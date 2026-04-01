import type { Locator } from '@playwright/test';
import { missingActionHandlerError, widgetPreconditionError } from '../domain/kernel/errors';
import type { WidgetInteractionContext, WidgetPrecondition } from '../domain/types';
import { widgetCapabilityContracts } from '../domain/widgets/contracts';
import { widgetActionHandlers } from './widgets';
import type { RuntimeResult} from './result';
import { runtimeErr, runtimeOk } from './result';

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

export async function interact(
  locator: Locator,
  widget: string,
  action: string,
  value?: string,
  context?: WidgetInteractionContext,
): Promise<RuntimeResult<void>> {
  const contract = widgetCapabilityContracts[widget];
  const handlers = widgetActionHandlers[widget];
  const handler = handlers?.[action];
  const hasAction = Boolean(contract?.supportedActions.includes(action as never) && handler);
  if (!contract || !handlers || !handler || !hasAction) {
    const error = missingActionHandlerError(widget, action);
    return runtimeErr('runtime-missing-action-handler', error.message, error.context, error);
  }

  for (const precondition of contract.requiredPreconditions) {
    const preconditionResult = await assertPrecondition(locator, precondition);
    if (!preconditionResult.ok) {
      return preconditionResult;
    }
  }

  await handler(locator, value, context);
  return runtimeOk(undefined);
}
