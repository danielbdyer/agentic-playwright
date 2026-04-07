import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type { RouteKnowledgeManifest } from '../intent/routes';

export const validateRouteKnowledgeManifest =
  schemaDecode.decoderFor<RouteKnowledgeManifest>(schemas.RouteKnowledgeManifestSchema);
/** @deprecated Use validateRouteKnowledgeManifest. */
export const validateHarvestManifest = validateRouteKnowledgeManifest;
