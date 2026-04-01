import type { WidgetId } from '../kernel/identity';
import type { EffectState } from './workflow';

export type WidgetAction = 'click' | 'fill' | 'clear' | 'get-value';
export type WidgetPrecondition = 'visible' | 'enabled' | 'editable';
export type WidgetEffectCategory = 'mutation' | 'observation' | 'focus' | 'navigation';

export interface WidgetInteractionContext {
  readonly affordance?: string | null | undefined;
}

export interface WidgetActionSemantics {
  readonly expectedStates: readonly EffectState[];
  readonly effectCategories: readonly WidgetEffectCategory[];
}

export interface WidgetCapabilityContract {
  readonly widget: WidgetId;
  readonly supportedActions: readonly WidgetAction[];
  readonly requiredPreconditions: readonly WidgetPrecondition[];
  readonly sideEffects: Readonly<Partial<Record<WidgetAction, WidgetActionSemantics>>>;
}
