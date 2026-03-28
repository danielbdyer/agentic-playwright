export type InteractionCapability =
  | 'clickable'
  | 'typeable'
  | 'selectable'
  | 'toggleable'
  | 'scrollable'
  | 'draggable'
  | 'focusable'
  | 'expandable'
  | 'dismissable';

export interface AffordanceConstraints {
  readonly isDisabled: boolean;
  readonly isReadonly: boolean;
  readonly isHidden: boolean;
  readonly isRequired: boolean;
  readonly maxLength: number | null;
  readonly pattern: string | null;
  readonly validValues: readonly string[] | null;
}

export interface ElementAffordance {
  readonly selector: string;
  readonly role: string | null;
  readonly tagName: string;
  readonly capabilities: readonly InteractionCapability[];
  readonly constraints: AffordanceConstraints;
  readonly ariaLabel: string | null;
}

export interface AffordanceMatch {
  readonly element: ElementAffordance;
  readonly intendedAction: string;
  readonly matchedCapability: InteractionCapability | null;
  readonly confidence: number;
  readonly warnings: readonly string[];
}
