import type { ConfidenceOverlayCatalog, DerivedGraph } from '../types';
import { validateByKind } from './registry';

export const validateDerivedGraph = (value: unknown): DerivedGraph => validateByKind('derived-graph', value);
export const validateConfidenceOverlayCatalog = (value: unknown): ConfidenceOverlayCatalog =>
  validateByKind('confidence-overlay-catalog', value);
