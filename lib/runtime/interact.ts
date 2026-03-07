import { Locator } from '@playwright/test';
import { osButton } from '../../knowledge/components/os-button';
import { osInput } from '../../knowledge/components/os-input';
import { osTable } from '../../knowledge/components/os-table';

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
): Promise<void> {
  const pattern = patterns[widget];
  if (!pattern || !pattern[action]) {
    throw new Error(`No ${action} action registered for ${widget}`);
  }

  await pattern[action](locator, value);
}

