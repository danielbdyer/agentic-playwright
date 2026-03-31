import type { ConfidenceOverlayCatalog, DerivedGraph, SurfaceGraph } from '../../types';
import {
  validateConfidenceOverlayCatalog,
  validateDerivedGraph,
  validateSurfaceGraph,
} from './legacy-core-validator';

export const validateSurfaceGraphArtifact: (value: unknown) => SurfaceGraph = validateSurfaceGraph;
export const validateDerivedGraphArtifact: (value: unknown) => DerivedGraph = validateDerivedGraph;
export const validateConfidenceOverlayCatalogArtifact: (value: unknown) => ConfidenceOverlayCatalog =
  validateConfidenceOverlayCatalog;
