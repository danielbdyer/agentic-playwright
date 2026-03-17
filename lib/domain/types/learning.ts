import type { AdoId } from '../identity';
import type { Confidence, StepAction } from './workflow';

export type LearningRuntime = 'decomposition' | 'repair-recovery' | 'workflow';

export interface GroundedSpecFragment {
  id: string;
  runtime: LearningRuntime;
  adoId: AdoId;
  title: string;
  stepIndexes: number[];
  action: StepAction | 'composite';
  intent: string;
  graphNodeIds: string[];
  selectorRefs: readonly string[];
  assertionAnchors: readonly string[];
  artifactRefs: string[];
  confidence: Extract<Confidence, 'compiler-derived' | 'agent-verified' | 'agent-proposed'>;
}

export interface ReplayExample {
  kind: 'replay-example';
  version: 1;
  runtime: LearningRuntime;
  adoId: AdoId;
  runId: string;
  sessionId?: string | null | undefined;
  createdAt: string;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  fragmentIds: string[];
  receiptRefs: string[];
  graphNodeIds: string[];
  selectorRefs: string[];
}

export interface TrainingCorpusRuntimeManifest {
  runtime: LearningRuntime;
  exampleCount: number;
  artifactPaths: string[];
  lastGeneratedAt?: string | null | undefined;
}

export interface TrainingCorpusManifest {
  kind: 'training-corpus-manifest';
  version: 1;
  generatedAt: string;
  corpora: TrainingCorpusRuntimeManifest[];
  replayExamples: number;
  scenarioIds: AdoId[];
  runIds: string[];
}
