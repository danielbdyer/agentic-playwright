import * as schemaDecode from '../schemas/decode';
import * as schemas from '../schemas';
import type { BoundStep } from '../types';

export { validateAdoSnapshot, validateBoundScenario, validateScenario } from './core';

/**
 * Canonical decode entry for bound intent steps.
 * Migrated from manual validation in `core.ts`.
 */
export const validateBoundStep: (value: unknown) => BoundStep =
  schemaDecode.decoderFor<BoundStep>(schemas.BoundStepSchema);
