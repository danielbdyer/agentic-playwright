import { Locator } from '@playwright/test';
import { missingActionHandlerError } from '../domain/errors';
import { WidgetPrecondition } from '../domain/types';
import { widgetActionHandlers, widgetCapabilityContracts } from '../../knowledge/components';
import { RuntimeResult, runtimeErr, runtimeOk } from './result';

async function assertPrecondition(locator: Locator, precondition: WidgetPrecondition): Promise<void> {
  const target = locator as unknown as {
    isVisible?: () => Promise<boolean>;
    isEnabled?: () => Promise<boolean>;
    isEditable?: () => Promise<boolean>;
  };
  switch (precondition) {
    case 'visible':
      if (typeof target.isVisible === 'function' && !(await target.isVisible())) {
        throw new Error('Widget precondition failed: visible');
      }
      return;
    case 'enabled':
      if (typeof target.isEnabled === 'function' && !(await target.isEnabled())) {
        throw new Error('Widget precondition failed: enabled');
      }
      return;
    case 'editable':
      if (typeof target.isEditable === 'function' && !(await target.isEditable())) {
        throw new Error('Widget precondition failed: editable');
      }
      return;
  }
}

export async function interact(
  locator: Locator,
  widget: string,
  action: string,
  value?: string,
): Promise<RuntimeResult<void>> {
  const contract = widgetCapabilityContracts[widget];
  const handlers = widgetActionHandlers[widget];
  const hasAction = Boolean(contract?.supportedActions.includes(action as never) && handlers?.[action]);
  if (!contract || !handlers || !hasAction) {
    const error = missingActionHandlerError(widget, action);
    return runtimeErr('runtime-missing-action-handler', error.message, error.context, error);
  }

  for (const precondition of contract.requiredPreconditions) {
    await assertPrecondition(locator, precondition);
  }

  await handlers[action](locator, value);
  return runtimeOk(undefined);
}
