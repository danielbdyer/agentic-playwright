import { expect, test } from '@playwright/test';
import { createWidgetId } from '../../lib/domain/kernel/identity';
import { widgetCapabilityContracts } from '../../lib/domain/widgets/contracts';
import {
  deriveRoleFromSignature,
  primaryAffordanceForRole,
  roleForWidget,
  roleSupportsAction,
  supportedStepActionsForRole,
  widgetForRole,
} from '../../lib/domain/widgets/role-affordances';

test('explicit role beats implicit signature derivation', () => {
  expect(deriveRoleFromSignature({
    role: 'combobox',
    tag: 'input',
    inputType: 'checkbox',
  })).toBe('combobox');
});

test('input signatures recover checkbox, radio, and numeric affordances deterministically', () => {
  expect(deriveRoleFromSignature({ tag: 'input', inputType: 'checkbox' })).toBe('checkbox');
  expect(deriveRoleFromSignature({ tag: 'input', inputType: 'radio' })).toBe('radio');
  expect(deriveRoleFromSignature({ tag: 'input', inputType: 'number' })).toBe('spinbutton');
});

test('legacy widget bridge stays aligned with the primary role lookup', () => {
  expect(roleForWidget(widgetForRole('combobox'))).toBe('combobox');
  expect(roleForWidget(widgetForRole('checkbox'))).toBe('checkbox');
  expect(roleForWidget(widgetForRole('table'))).toBe('table');
});

test('derived widget contracts expose checkbox, select, and radio actions without hand-authored tables', () => {
  expect(widgetCapabilityContracts[createWidgetId('os-checkbox')]?.supportedActions).toEqual(
    expect.arrayContaining(['check', 'uncheck', 'get-value']),
  );
  expect(widgetCapabilityContracts[createWidgetId('os-select')]?.supportedActions).toEqual(
    expect.arrayContaining(['fill', 'select', 'get-value']),
  );
  expect(widgetCapabilityContracts[createWidgetId('os-radio')]?.supportedActions).toEqual(
    expect.arrayContaining(['check', 'get-value']),
  );
});

test('step-action families remain derivable from affordances', () => {
  expect(primaryAffordanceForRole('checkbox')).toBe('check');
  expect(roleSupportsAction('checkbox', 'check')).toBeTruthy();
  expect(roleSupportsAction('radio', 'uncheck')).toBeFalsy();
  expect(supportedStepActionsForRole('button')).toEqual(['click']);
  expect(supportedStepActionsForRole('checkbox')).toEqual(['input']);
  expect(supportedStepActionsForRole('dialog')).toEqual(['assert-snapshot']);
});
