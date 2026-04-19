import type { ConfidenceOverlayCatalog } from '../knowledge/types';
import type { DerivedGraph } from '../projection/types';
import { validateByKind } from './registry';

export const validateDerivedGraph = (value: unknown): DerivedGraph => validateByKind('derived-graph', value);
export const validateConfidenceOverlayCatalog = (value: unknown): ConfidenceOverlayCatalog =>
  validateByKind('confidence-overlay-catalog', value);
