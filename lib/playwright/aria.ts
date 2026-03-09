import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { normalizeAriaSnapshot, renderAriaSnapshot } from '../domain/aria-snapshot';
import { snapshotHandleResolutionError } from '../domain/errors';
import type { RuntimeResult } from '../runtime/result';
import { runtimeErr, runtimeOk } from '../runtime/result';

export async function captureAriaYaml(locator: Locator): Promise<RuntimeResult<string>> {
  const handle = await locator.elementHandle();
  if (!handle) {
    const error = snapshotHandleResolutionError();
    return runtimeErr('runtime-snapshot-handle-resolution-failed', error.message, error.context, error);
  }

  const snapshot = await locator.page().accessibility.snapshot({
    root: handle,
    interestingOnly: false,
  });

  if (!snapshot) {
    return runtimeOk('');
  }

  return runtimeOk(renderAriaSnapshot(snapshot));
}

export async function expectAriaSnapshot(locator: Locator, expectedSnapshot: string): Promise<RuntimeResult<void>> {
  const actual = await captureAriaYaml(locator);
  if (!actual.ok) {
    return actual;
  }

  await expect(actual.value).toBe(normalizeAriaSnapshot(expectedSnapshot));
  return runtimeOk(undefined);
}
