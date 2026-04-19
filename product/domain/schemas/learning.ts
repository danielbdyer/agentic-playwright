import { Schema } from 'effect';
import {
  AdoIdSchema,
  NullableString,
  StringArray,
} from './primitives';

// ─── Learning Runtime ───

export const LearningRuntimeSchema = Schema.Literal('decomposition', 'repair-recovery', 'workflow');

// ─── Replay Example ───

export const ReplayExampleSchema = Schema.Struct({
  kind: Schema.Literal('replay-example'),
  version: Schema.Literal(1),
  runtime: LearningRuntimeSchema,
  adoId: AdoIdSchema,
  runId: Schema.String,
  sessionId: Schema.optionalWith(NullableString, { default: () => null }),
  createdAt: Schema.String,
  taskFingerprint: Schema.String,
  knowledgeFingerprint: Schema.String,
  fragmentIds: StringArray,
  receiptRefs: StringArray,
  graphNodeIds: StringArray,
  selectorRefs: StringArray,
});

// ─── Training Corpus Manifest ───

export const TrainingCorpusRuntimeManifestSchema = Schema.Struct({
  runtime: LearningRuntimeSchema,
  exampleCount: Schema.Number,
  artifactPaths: StringArray,
  lastGeneratedAt: Schema.optionalWith(NullableString, { default: () => null }),
});

export const TrainingCorpusManifestSchema = Schema.Struct({
  kind: Schema.Literal('training-corpus-manifest'),
  version: Schema.Literal(1),
  generatedAt: Schema.String,
  corpora: Schema.Array(TrainingCorpusRuntimeManifestSchema),
  replayExamples: Schema.Number,
  scenarioIds: Schema.Array(AdoIdSchema),
  runIds: StringArray,
});

export const LearningScorecardSchema = Schema.Struct({
  corpusFragmentCount: Schema.Number,
  replayExampleCount: Schema.Number,
  avgReproducibilityScore: Schema.Number,
  fragmentProvenanceCompleteness: Schema.Number,
  thinScreenCount: Schema.Number,
  thinActionFamilyCount: Schema.Number,
  topBottleneckScreen: Schema.NullOr(Schema.String),
  topBottleneckImpact: Schema.Number,
  rankedProposalCount: Schema.Number,
  topProposalId: Schema.NullOr(Schema.String),
  topProposalScore: Schema.Number,
});
