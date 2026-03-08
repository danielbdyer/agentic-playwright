import YAML from 'yaml';
import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { snapshotHandleResolutionError } from '../domain/errors';
import type { RuntimeResult } from '../runtime/result';
import { runtimeErr, runtimeOk } from '../runtime/result';

interface AccessibilityNode {
  role?: string;
  name?: string;
  valueString?: string;
  checked?: boolean | 'mixed';
  pressed?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  children?: AccessibilityNode[];
}

function normalizeNode(node: AccessibilityNode): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  if (node.role) normalized.role = node.role;
  if (node.name) normalized.name = node.name;
  if (node.valueString) normalized.value = node.valueString;
  if (node.checked !== undefined) normalized.checked = node.checked;
  if (node.pressed !== undefined) normalized.pressed = node.pressed;
  if (node.disabled !== undefined) normalized.disabled = node.disabled;
  if (node.expanded !== undefined) normalized.expanded = node.expanded;
  if (node.selected !== undefined) normalized.selected = node.selected;
  if (node.children && node.children.length > 0) {
    normalized.children = node.children.map((child) => normalizeNode(child));
  }

  return normalized;
}

function normalizeSnapshotText(snapshot: string): string {
  return snapshot.replace(/\r\n/g, '\n').trim();
}

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

  return runtimeOk(normalizeSnapshotText(YAML.stringify(normalizeNode(snapshot as AccessibilityNode), { indent: 2 })));
}

export async function expectAriaSnapshot(locator: Locator, expectedSnapshot: string): Promise<RuntimeResult<void>> {
  const actual = await captureAriaYaml(locator);
  if (!actual.ok) {
    return actual;
  }

  await expect(actual.value).toBe(normalizeSnapshotText(expectedSnapshot));
  return runtimeOk(undefined);
}
