import type { Locator } from '@playwright/test';
import { missingActionHandlerError, widgetPreconditionError } from '../domain/errors';
import type { WidgetInteractionContext, WidgetPrecondition } from '../domain/types';
import { widgetCapabilityContracts } from '../domain/widgets/contracts';
import { widgetActionHandlers } from './widgets';
import type { RuntimeResult} from './result';
import { runtimeErr, runtimeOk } from './result';

async function assertPrecondition(locator: Locator, precondition: WidgetPrecondition): Promise<RuntimeResult<void>> {
  const target = locator as unknown as {
    isVisible?: () => Promise<boolean>;
    isEnabled?: () => Promise<boolean>;
    isEditable?: () => Promise<boolean>;
  };

  switch (precondition) {
    case 'visible':
      if (typeof target.isVisible === 'function' && !(await target.isVisible())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr('runtime-widget-precondition-failed', error.message, error.context, error);
      }
      return runtimeOk(undefined);
    case 'enabled':
      if (typeof target.isEnabled === 'function' && !(await target.isEnabled())) {
        const error = widgetPreconditionError(precondition);
        return runtimeErr('runtime-widget-precondition-failed', error.message, error.context, error);
      }
      return runtimeOk(undefined);
    case 'editable':
      if (typeof target.isEditable === 'function' && !(await target.isEditable())) {
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
