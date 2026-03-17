import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import type { ReplayExample, TrainingCorpusManifest } from '../types';

export const validateReplayExample = schemaDecode.decoderFor<ReplayExample>(schemas.ReplayExampleSchema);

export const validateTrainingCorpusManifest = schemaDecode.decoderFor<TrainingCorpusManifest>(schemas.TrainingCorpusManifestSchema);
