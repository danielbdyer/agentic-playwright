import type { ConfidenceOverlayCatalog, SurfaceGraph } from '../../knowledge/types';
import type { DerivedGraph } from '../../projection/types';
import { validateConfidenceOverlayCatalog, validateDerivedGraph, validateSurfaceGraph } from '../core';

export const validateSurfaceGraphArtifact: (value: unknown) => SurfaceGraph = validateSurfaceGraph;
export const validateDerivedGraphArtifact: (value: unknown) => DerivedGraph = validateDerivedGraph;
export const validateConfidenceOverlayCatalogArtifact: (value: unknown) => ConfidenceOverlayCatalog =
  validateConfidenceOverlayCatalog;
