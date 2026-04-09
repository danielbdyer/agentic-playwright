/**
 * Resolution context validators: DatasetControl, ResolutionControl, RunbookControl,
 * ScenarioInterpretationSurface.
 *
 * ScenarioInterpretationSurface is re-exported from intent-validator
 * since it belongs to the intent/resolution boundary.
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import type { DatasetControl, ResolutionControl, RunbookControl } from '../../resolution/types';
import { ensureSafeRelativePathLike } from '../../kernel/identity';
export {
  validateScenarioInterpretationSurfaceArtifact,
} from './intent-validator';

export const validateDatasetControlArtifact: (value: unknown) => DatasetControl =
  schemaDecode.decoderFor<DatasetControl>(schemas.DatasetControlSchema);

export function validateResolutionControlArtifact(value: unknown): ResolutionControl {
  const decoded = schemaDecode.decoderFor<ResolutionControl>(schemas.ResolutionControlSchema)(value);
  for (const [index, suite] of decoded.selector.suites.entries()) {
    ensureSafeRelativePathLike(suite, `resolution-control.selector.suites[${index}]`);
  }
  return decoded;
}

export function validateRunbookControlArtifact(value: unknown): RunbookControl {
  const decoded = schemaDecode.decoderFor<RunbookControl>(schemas.RunbookControlSchema)(value);
  for (const [index, suite] of decoded.selector.suites.entries()) {
    ensureSafeRelativePathLike(suite, `runbook-control.selector.suites[${index}]`);
  }
  return decoded;
}
