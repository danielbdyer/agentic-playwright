import type {
  AffordanceMatch,
  ElementAffordance,
  InteractionCapability,
} from './types/affordance';

// --- Tag-name to capabilities mapping ---

const tagCapabilities: Readonly<Record<string, readonly InteractionCapability[]>> = {
  button: ['clickable', 'focusable'],
  a: ['clickable', 'focusable'],
  input: ['focusable'],
  textarea: ['typeable', 'focusable'],
  select: ['selectable', 'focusable'],
  details: ['expandable', 'focusable'],
  dialog: ['dismissable'],
};

// --- Input type to capabilities mapping ---

const inputTypeCapabilities: Readonly<Record<string, readonly InteractionCapability[]>> = {
  text: ['typeable', 'focusable'],
  password: ['typeable', 'focusable'],
  email: ['typeable', 'focusable'],
  number: ['typeable', 'focusable'],
  search: ['typeable', 'focusable'],
  tel: ['typeable', 'focusable'],
  url: ['typeable', 'focusable'],
  checkbox: ['toggleable', 'focusable'],
  radio: ['toggleable', 'focusable'],
  submit: ['clickable', 'focusable'],
  reset: ['clickable', 'focusable'],
  button: ['clickable', 'focusable'],
};

// --- Role to capabilities mapping ---

const roleCapabilities: Readonly<Record<string, readonly InteractionCapability[]>> = {
  button: ['clickable', 'focusable'],
  link: ['clickable', 'focusable'],
  textbox: ['typeable', 'focusable'],
  listbox: ['selectable', 'focusable'],
  combobox: ['selectable', 'focusable'],
  checkbox: ['toggleable', 'focusable'],
  switch: ['toggleable', 'focusable'],
  radio: ['toggleable', 'focusable'],
  tab: ['expandable', 'focusable'],
  dialog: ['dismissable'],
  alertdialog: ['dismissable'],
  scrollbar: ['scrollable'],
};

// --- Action verb to capability mapping ---

const actionVerbCapabilities: Readonly<Record<string, InteractionCapability>> = {
  click: 'clickable',
  press: 'clickable',
  tap: 'clickable',
  type: 'typeable',
  enter: 'typeable',
  fill: 'typeable',
  select: 'selectable',
  choose: 'selectable',
  pick: 'selectable',
  toggle: 'toggleable',
  check: 'toggleable',
  uncheck: 'toggleable',
  scroll: 'scrollable',
  expand: 'expandable',
  collapse: 'expandable',
  close: 'dismissable',
  dismiss: 'dismissable',
  drag: 'draggable',
};

/**
 * Deduplicate and sort capabilities for deterministic output.
 */
const uniqueCapabilities = (
  caps: readonly InteractionCapability[],
): readonly InteractionCapability[] =>
  [...new Set(caps)].sort((a, b) => a.localeCompare(b));

/**
 * Infer capabilities from an element's tag name, role, and attributes.
 * Pure function: no side effects, no mutation.
 */
export function inferCapabilities(
  tagName: string,
  role: string | null,
  attributes: Readonly<Record<string, string>>,
): readonly InteractionCapability[] {
  const normalizedTag = tagName.toLowerCase();

  const fromTag: readonly InteractionCapability[] =
    normalizedTag === 'input'
      ? (inputTypeCapabilities[(attributes.type ?? 'text').toLowerCase()] ?? ['focusable'])
      : (tagCapabilities[normalizedTag] ?? []);

  const fromRole: readonly InteractionCapability[] =
    role !== null ? (roleCapabilities[role.toLowerCase()] ?? []) : [];

  const fromAttributes: readonly InteractionCapability[] = [
    ...(attributes.contenteditable === 'true' ? (['typeable', 'focusable'] as const) : []),
    ...(attributes['aria-expanded'] !== undefined ? (['expandable', 'focusable'] as const) : []),
    ...(attributes.draggable === 'true' ? (['draggable', 'focusable'] as const) : []),
  ];

  return uniqueCapabilities([...fromTag, ...fromRole, ...fromAttributes]);
}

/**
 * Resolve the first verb token from a natural-language action string.
 */
const extractActionVerb = (action: string): string =>
  (action.toLowerCase().trim().split(/\s+/)[0] ?? '');

/**
 * Build constraint warnings for a given action on an element.
 */
const constraintWarnings = (affordance: ElementAffordance): readonly string[] => [
  ...(affordance.constraints.isDisabled ? ['Element is disabled'] : []),
  ...(affordance.constraints.isHidden ? ['Element is hidden'] : []),
  ...(affordance.constraints.isReadonly ? ['Element is readonly'] : []),
];

/**
 * Match an intended action against an element's affordances.
 * Returns confidence 1.0 for exact match, 0.5 for focusable-only fallback, 0.0 for miss.
 */
export function matchAffordance(
  affordance: ElementAffordance,
  intendedAction: string,
): AffordanceMatch {
  const verb = extractActionVerb(intendedAction);
  const requiredCapability: InteractionCapability | undefined = actionVerbCapabilities[verb];
  const warnings = constraintWarnings(affordance);

  if (requiredCapability !== undefined && affordance.capabilities.includes(requiredCapability)) {
    return {
      element: affordance,
      intendedAction,
      matchedCapability: requiredCapability,
      confidence: 1.0,
      warnings,
    };
  }

  if (affordance.capabilities.includes('focusable')) {
    return {
      element: affordance,
      intendedAction,
      matchedCapability: null,
      confidence: 0.5,
      warnings,
    };
  }

  return {
    element: affordance,
    intendedAction,
    matchedCapability: null,
    confidence: 0.0,
    warnings,
  };
}
