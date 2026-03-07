import { Locator } from '@playwright/test';
import { missingActionHandlerError } from '../domain/errors';
import { osButton } from '../../knowledge/components/os-button';
import { osInput } from '../../knowledge/components/os-input';
import { osTable } from '../../knowledge/components/os-table';
import { RuntimeResult, runtimeErr, runtimeOk } from './result';

const patterns: Record<string, Record<string, (locator: Locator, value?: string) => Promise<unknown>>> = {
  'os-button': osButton,
  'os-input': osInput,
  'os-table': osTable,
};

export async function interact(
  locator: Locator,
  widget: string,
  action: string,
  value?: string,
): Promise<RuntimeResult<void>> {
  const pattern = patterns[widget];
  if (!pattern || !pattern[action]) {
    const error = missingActionHandlerError(widget, action);
    return runtimeErr('runtime-missing-action-handler', error.message, error.context, error);
  }

  await pattern[action](locator, value);
  return runtimeOk(undefined);
}
