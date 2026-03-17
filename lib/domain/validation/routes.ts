import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type { HarvestManifest } from '../types';

export const validateHarvestManifest = schemaDecode.decoderFor<HarvestManifest>(schemas.HarvestManifestSchema);
