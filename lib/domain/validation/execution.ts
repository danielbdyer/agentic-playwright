import type { InterpretationDriftRecord, ResolutionGraphRecord, RunRecord } from '../execution/types';
import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DogfoodRun,
} from '../projection/types';
import type { EvidenceRecord } from '../resolution/types';
import * as schemas from '../schemas';
import * as schemaDecode from '../schemas/decode';
import { validateByKind } from './registry';

export const validateRunRecord = (value: unknown): RunRecord => validateByKind('run-record', value);
export const validateBenchmarkContext = (value: unknown): BenchmarkContext => validateByKind('benchmark-context', value);
export const validateResolutionGraphRecord = (value: unknown): ResolutionGraphRecord =>
  validateByKind('resolution-graph-record', value);
export const validateInterpretationDriftRecord = (value: unknown): InterpretationDriftRecord =>
  validateByKind('interpretation-drift-record', value);
export const validateBenchmarkScorecard = (value: unknown): BenchmarkScorecard => validateByKind('benchmark-scorecard', value);
export const validateBenchmarkImprovementProjection = (value: unknown): BenchmarkImprovementProjection =>
  validateByKind('benchmark-improvement-projection', value);
export const validateDogfoodRun = (value: unknown): DogfoodRun => validateByKind('dogfood-run', value);

// Evidence records don't have a top-level `kind` discriminator (they
// wrap a single `evidence: {...}` object), so they bypass
// validateByKind and use a direct schema decoder instead. Prior to
// this validator, the catalog loader at workspace-catalog.ts:362
// cast evidence records via `(v) => v as EvidenceRecord` with no
// validation, making malformed files a silent downstream crash.
export const validateEvidenceRecord = schemaDecode.decoderFor<EvidenceRecord>(
  schemas.EvidenceRecordSchema,
);
