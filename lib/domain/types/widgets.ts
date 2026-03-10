import type { WidgetId } from '../identity';
import type { EffectState } from './workflow';

export type WidgetAction = 'click' | 'fill' | 'clear' | 'get-value';
export type WidgetPrecondition = 'visible' | 'enabled' | 'editable';
export type WidgetEffectCategory = 'mutation' | 'observation' | 'focus' | 'navigation';

export interface WidgetInteractionContext {
  affordance?: string | null | undefined;
}

export interface WidgetActionSemantics {
  expectedStates: EffectState[];
  effectCategories: WidgetEffectCategory[];
}

export interface WidgetCapabilityContract {
  widget: WidgetId;
  supportedActions: WidgetAction[];
  requiredPreconditions: WidgetPrecondition[];
  sideEffects: Partial<Record<WidgetAction, WidgetActionSemantics>>;
}
