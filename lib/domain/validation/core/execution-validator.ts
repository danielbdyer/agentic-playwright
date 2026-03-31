import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DogfoodRun,
  InterpretationDriftRecord,
  ResolutionGraphRecord,
  RunRecord,
} from '../../types';
import {
  validateBenchmarkContext,
  validateBenchmarkImprovementProjection,
  validateBenchmarkScorecard,
  validateDogfoodRun,
  validateInterpretationDriftRecord,
  validateResolutionGraphRecord,
  validateRunRecord,
} from './legacy-core-validator';

export const validateRunRecordArtifact: (value: unknown) => RunRecord = validateRunRecord;
export const validateBenchmarkContextArtifact: (value: unknown) => BenchmarkContext = validateBenchmarkContext;
export const validateResolutionGraphRecordArtifact: (value: unknown) => ResolutionGraphRecord = validateResolutionGraphRecord;
export const validateInterpretationDriftRecordArtifact: (value: unknown) => InterpretationDriftRecord =
  validateInterpretationDriftRecord;
export const validateBenchmarkScorecardArtifact: (value: unknown) => BenchmarkScorecard = validateBenchmarkScorecard;
export const validateBenchmarkImprovementProjectionArtifact: (value: unknown) => BenchmarkImprovementProjection =
  validateBenchmarkImprovementProjection;
export const validateDogfoodRunArtifact: (value: unknown) => DogfoodRun = validateDogfoodRun;
