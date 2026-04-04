import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type { HarvestManifest } from '../intent/routes';

export const validateHarvestManifest = schemaDecode.decoderFor<HarvestManifest>(schemas.HarvestManifestSchema);
export const validateRouteKnowledgeManifest = validateHarvestManifest;
