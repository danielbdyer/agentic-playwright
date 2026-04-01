/**
 * Graph context validators: SurfaceGraph, DerivedGraph, ConfidenceOverlayCatalog.
 * All pure schema-decode validators with no shared helper deps.
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import type { ConfidenceOverlayCatalog, DerivedGraph, SurfaceGraph } from '../../types';

export const validateSurfaceGraphArtifact: (value: unknown) => SurfaceGraph =
  schemaDecode.decoderFor<SurfaceGraph>(schemas.SurfaceGraphSchema);

export const validateDerivedGraphArtifact: (value: unknown) => DerivedGraph =
  schemaDecode.decoderFor<DerivedGraph>(schemas.DerivedGraphSchema);

export const validateConfidenceOverlayCatalogArtifact: (value: unknown) => ConfidenceOverlayCatalog =
  schemaDecode.decoderFor<ConfidenceOverlayCatalog>(schemas.ConfidenceOverlayCatalogSchema);
