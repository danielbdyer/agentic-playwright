import type { Manifest } from '../governance/workflow-types';
import type {
  BehaviorPatternDocument,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  SurfaceGraph,
} from '../knowledge/types';
import type { WidgetCapabilityContract } from '../knowledge/widget-types';
import { validateByKind } from './registry';

export const validateWidgetCapabilityContract = (value: unknown, _path = 'widget-contract'): WidgetCapabilityContract =>
  validateByKind('widget-capability-contract', value);

export const validateSurfaceGraph = (value: unknown): SurfaceGraph => validateByKind('surface-graph', value);
export const validateScreenElements = (value: unknown): ScreenElements => validateByKind('screen-elements', value);
export const validateScreenHints = (value: unknown): ScreenHints => validateByKind('screen-hints', value);
export const validatePatternDocument = (value: unknown): PatternDocument => validateByKind('pattern-document', value);
export const validateSharedPatterns = (value: unknown): SharedPatterns => validateByKind('shared-patterns', value);
export const validateScreenPostures = (value: unknown): ScreenPostures => validateByKind('screen-postures', value);
export const validateScreenBehavior = (value: unknown): ScreenBehavior => validateByKind('screen-behavior', value);
export const validateBehaviorPatternDocument = (value: unknown): BehaviorPatternDocument =>
  validateByKind('behavior-pattern-document', value);
export const validateManifest = (value: unknown): Manifest => validateByKind('manifest', value);
