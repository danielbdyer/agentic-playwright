/**
 * Role-Affordance Derivation Table
 *
 * Deterministic mapping from ARIA roles to Playwright interactions.
 * Replaces hand-authored widget handlers with a compile-time constant table.
 *
 * Pure domain module — no side effects, no application/infrastructure/runtime imports.
 */

import type { WidgetAction, WidgetEffectCategory, WidgetPrecondition } from '../types/widgets';

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

