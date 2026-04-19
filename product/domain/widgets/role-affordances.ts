/**
 * Role-Affordance Derivation Table
 *
 * Deterministic mapping from ARIA roles to Playwright interactions.
 * Replaces hand-authored widget handlers with a compile-time constant table.
 *
 * Pure domain module — no side effects, no application/infrastructure/runtime imports.
 */

import type { WidgetAction, WidgetEffectCategory, WidgetPrecondition } from '../knowledge/widget-types';

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

export interface RoleAffordance {
  readonly action: WidgetAction;
  readonly method: string;
  readonly args: 'value' | 'none';
  readonly effectCategory: WidgetEffectCategory;
  readonly preconditions: readonly WidgetPrecondition[];
}

export type SupportedStepAction = 'click' | 'input' | 'assert-snapshot';
export type AffordanceFamily = 'clickable' | 'fillable' | 'checkable' | 'selectable' | 'readable' | 'tabular';

// ---------------------------------------------------------------------------
// ROLE_AFFORDANCES — the canonical derivation table
// ---------------------------------------------------------------------------

const mutationPre: readonly WidgetPrecondition[] = ['visible', 'enabled'] as const;
const editablePre: readonly WidgetPrecondition[] = ['visible', 'enabled', 'editable'] as const;
const observationPre: readonly WidgetPrecondition[] = ['visible'] as const;

export const ROLE_AFFORDANCES: Readonly<Record<string, readonly RoleAffordance[]>> = {
  button: [
    { action: 'click', method: 'click', args: 'none', effectCategory: 'mutation', preconditions: mutationPre },
    { action: 'get-value', method: 'innerText', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  link: [
    { action: 'click', method: 'click', args: 'none', effectCategory: 'navigation', preconditions: mutationPre },
    { action: 'get-value', method: 'innerText', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  textbox: [
    { action: 'fill', method: 'fill', args: 'value', effectCategory: 'mutation', preconditions: editablePre },
    { action: 'clear', method: 'clear', args: 'none', effectCategory: 'mutation', preconditions: editablePre },
    { action: 'get-value', method: 'inputValue', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  checkbox: [
    { action: 'check', method: 'check', args: 'none', effectCategory: 'mutation', preconditions: mutationPre },
    { action: 'uncheck', method: 'uncheck', args: 'none', effectCategory: 'mutation', preconditions: mutationPre },
    { action: 'get-value', method: 'isChecked', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  radio: [
    { action: 'check', method: 'check', args: 'none', effectCategory: 'mutation', preconditions: mutationPre },
    { action: 'get-value', method: 'isChecked', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  combobox: [
    { action: 'fill', method: 'fill', args: 'value', effectCategory: 'mutation', preconditions: editablePre },
    { action: 'select', method: 'selectOption', args: 'value', effectCategory: 'mutation', preconditions: mutationPre },
    { action: 'get-value', method: 'inputValue', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  listbox: [
    { action: 'select', method: 'selectOption', args: 'value', effectCategory: 'mutation', preconditions: mutationPre },
    { action: 'get-value', method: 'innerText', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  tab: [
    { action: 'click', method: 'click', args: 'none', effectCategory: 'focus', preconditions: mutationPre },
  ],
  slider: [
    { action: 'fill', method: 'fill', args: 'value', effectCategory: 'mutation', preconditions: editablePre },
    { action: 'get-value', method: 'inputValue', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  spinbutton: [
    { action: 'fill', method: 'fill', args: 'value', effectCategory: 'mutation', preconditions: editablePre },
    { action: 'get-value', method: 'inputValue', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  table: [
    { action: 'get-value', method: 'innerText', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  grid: [
    { action: 'get-value', method: 'innerText', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
  dialog: [
    { action: 'get-value', method: 'innerText', args: 'none', effectCategory: 'observation', preconditions: observationPre },
  ],
} as const;

// ---------------------------------------------------------------------------
// TAG_IMPLICIT_ROLE — HTML tag to implicit ARIA role
// ---------------------------------------------------------------------------

export const TAG_IMPLICIT_ROLE: Readonly<Record<string, string>> = {
  button: 'button',
  a: 'link',
  select: 'combobox',
  textarea: 'textbox',
  table: 'table',
  input: 'textbox',
} as const;

// ---------------------------------------------------------------------------
// INPUT_TYPE_ROLE — input[type] refinement
// ---------------------------------------------------------------------------

export const INPUT_TYPE_ROLE: Readonly<Record<string, string>> = {
  checkbox: 'checkbox',
  radio: 'radio',
  text: 'textbox',
  email: 'textbox',
  password: 'textbox',
  search: 'textbox',
  tel: 'textbox',
  url: 'textbox',
  number: 'spinbutton',
  range: 'slider',
  date: 'textbox',
  time: 'textbox',
} as const;

// ---------------------------------------------------------------------------
// Legacy widget bridge — compatibility only, not the source of truth
// ---------------------------------------------------------------------------

export const LEGACY_WIDGET_ROLE_BRIDGE: Readonly<Record<string, string>> = {
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

export const PRIMARY_WIDGET_FOR_ROLE: Readonly<Record<string, string>> = {
  button: 'os-button',
  link: 'os-link',
  textbox: 'os-input',
  searchbox: 'os-input',
  combobox: 'os-select',
  listbox: 'os-select',
  checkbox: 'os-checkbox',
  radio: 'os-radio',
  switch: 'os-checkbox',
  table: 'os-table',
  grid: 'os-table',
  tab: 'os-button',
  slider: 'os-input',
  spinbutton: 'os-input',
  dialog: 'os-region',
} as const;

// ---------------------------------------------------------------------------
// Pure derivation functions
// ---------------------------------------------------------------------------

/**
 * Derive the ARIA role from an element signature.
 *
 * Precedence:
 *   1. Explicit role attribute
 *   2. tag=input refined by inputType
 *   3. Tag fallback via TAG_IMPLICIT_ROLE
 */
export function deriveRoleFromSignature(signature: {
  readonly role?: string;
  readonly tag?: string;
  readonly inputType?: string;
}): string | null {
  if (signature.role) {
    return signature.role;
  }

  const tag = signature.tag?.toLowerCase();
  if (!tag) {
    return null;
  }

  if (tag === 'input' && signature.inputType) {
    const refined = INPUT_TYPE_ROLE[signature.inputType.toLowerCase()];
    if (refined) {
      return refined;
    }
  }

  return TAG_IMPLICIT_ROLE[tag] ?? null;
}

/**
 * Return the affordances for a given ARIA role.
 * Returns an empty array for unknown roles.
 */
export function affordancesForRole(role: string): readonly RoleAffordance[] {
  return ROLE_AFFORDANCES[role] ?? [];
}

export function roleForWidget(widget: string): string | null {
  return LEGACY_WIDGET_ROLE_BRIDGE[widget] ?? null;
}

export function widgetForRole(role: string): string {
  return PRIMARY_WIDGET_FOR_ROLE[role] ?? 'os-region';
}

export function roleSupportsAction(role: string, action: WidgetAction): boolean {
  return affordancesForRole(role).some((affordance) => affordance.action === action);
}

export function primaryAffordanceForRole(role: string): WidgetAction | null {
  const affordance = affordancesForRole(role).find((entry) => entry.effectCategory !== 'observation')
    ?? affordancesForRole(role)[0];
  return affordance?.action ?? null;
}

export function preferredScenarioActionForRole(role: string): WidgetAction | null {
  if (role === 'combobox' || role === 'listbox') {
    return roleSupportsAction(role, 'select') ? 'select' : primaryAffordanceForRole(role);
  }
  if (role === 'checkbox' || role === 'radio') {
    return roleSupportsAction(role, 'check') ? 'check' : primaryAffordanceForRole(role);
  }
  if (role === 'button' || role === 'link' || role === 'tab') {
    return roleSupportsAction(role, 'click') ? 'click' : primaryAffordanceForRole(role);
  }
  return primaryAffordanceForRole(role);
}

function affordanceFamiliesForAction(action: WidgetAction): readonly AffordanceFamily[] {
  switch (action) {
    case 'click':
      return ['clickable'];
    case 'fill':
    case 'clear':
      return ['fillable'];
    case 'check':
    case 'uncheck':
      return ['checkable'];
    case 'select':
      return ['selectable'];
    case 'get-value':
      return ['readable'];
  }
}

const ROLE_EXTRA_FAMILIES: Readonly<Record<string, readonly AffordanceFamily[]>> = {
  table: ['tabular'],
  grid: ['tabular'],
} as const;

export function affordanceFamiliesForRole(role: string): readonly AffordanceFamily[] {
  const baseFamilies = affordancesForRole(role).flatMap((affordance) => affordanceFamiliesForAction(affordance.action));
  return [...new Set([...baseFamilies, ...(ROLE_EXTRA_FAMILIES[role] ?? [])])];
}

export function affordanceFamiliesForWidget(widget: string): readonly AffordanceFamily[] {
  const role = roleForWidget(widget);
  return role ? affordanceFamiliesForRole(role) : ['readable'];
}

export function roleHasAffordanceFamily(role: string, family: AffordanceFamily): boolean {
  return affordanceFamiliesForRole(role).includes(family);
}

export function widgetHasAffordanceFamily(widget: string, family: AffordanceFamily): boolean {
  return affordanceFamiliesForWidget(widget).includes(family);
}

export function supportedStepActionsForRole(role: string): readonly SupportedStepAction[] {
  const affordances = affordancesForRole(role);
  const hasClick = affordances.some((affordance) => affordance.action === 'click');
  const hasInput = affordances.some((affordance) =>
    affordance.action === 'fill' || affordance.action === 'check' || affordance.action === 'select',
  );
  if (hasClick && !hasInput) {
    return ['click'];
  }
  if (hasInput) {
    return ['input'];
  }
  return ['assert-snapshot'];
}

