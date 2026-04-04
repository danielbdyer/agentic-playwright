import type { InterpretationDriftRecord, ResolutionGraphRecord, RunRecord } from '../execution/types';
import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DogfoodRun,
} from '../projection/types';
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
