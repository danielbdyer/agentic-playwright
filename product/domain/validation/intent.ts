import * as schemaDecode from '../schemas/decode';
import * as schemas from '../schemas';
import type {
  AdoSnapshot,
  BoundScenario,
  BoundStep,
  Scenario,
} from '../intent/types';
import { validateByKind } from './registry';

export const validateAdoSnapshot = (value: unknown): AdoSnapshot => validateByKind('ado-snapshot', value);
export const validateScenario = (value: unknown): Scenario => validateByKind('scenario', value);

/**
 * Canonical decode entry for bound intent steps.
 * Migrated from manual validation in `core.ts`.
 */
export const validateBoundStep: (value: unknown) => BoundStep =
  schemaDecode.decoderFor<BoundStep>(schemas.BoundStepSchema);

export const validateBoundScenario = (value: unknown): BoundScenario => validateByKind('bound-scenario', value);
