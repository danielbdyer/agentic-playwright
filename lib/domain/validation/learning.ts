import { createAdoId } from '../identity';
import type { GroundedSpecFragment, ReplayExample, TrainingCorpusManifest } from '../types';
import {
  expectArray,
  expectEnum,
  expectId,
  expectNumber,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
} from './primitives';

function validateGroundedSpecFragment(value: unknown, path: string): GroundedSpecFragment {
  const fragment = expectRecord(value, path);
  return {
    id: expectString(fragment.id, `${path}.id`),
    runtime: expectEnum(fragment.runtime, `${path}.runtime`, ['decomposition', 'repair-recovery', 'workflow'] as const),
    adoId: expectId(fragment.adoId, `${path}.adoId`, createAdoId),
    title: expectString(fragment.title, `${path}.title`),
    stepIndexes: expectArray(fragment.stepIndexes ?? [], `${path}.stepIndexes`).map((entry, index) =>
      expectNumber(entry, `${path}.stepIndexes[${index}]`),
    ),
    action: expectEnum(fragment.action, `${path}.action`, ['navigate', 'input', 'click', 'assert-snapshot', 'custom', 'composite'] as const),
    intent: expectString(fragment.intent, `${path}.intent`),
    graphNodeIds: expectStringArray(fragment.graphNodeIds ?? [], `${path}.graphNodeIds`),
    selectorRefs: expectStringArray(fragment.selectorRefs ?? [], `${path}.selectorRefs`),
    assertionAnchors: expectStringArray(fragment.assertionAnchors ?? [], `${path}.assertionAnchors`),
    artifactRefs: expectStringArray(fragment.artifactRefs ?? [], `${path}.artifactRefs`),
    confidence: expectEnum(fragment.confidence, `${path}.confidence`, ['compiler-derived', 'agent-verified', 'agent-proposed'] as const),
  };
}

export function validateReplayExample(value: unknown): ReplayExample {
  const replay = expectRecord(value, 'replayExample');
  return {
    kind: expectEnum(replay.kind, 'replayExample.kind', ['replay-example'] as const),
    version: expectEnum(String(replay.version ?? '1'), 'replayExample.version', ['1'] as const) as unknown as 1,
    runtime: expectEnum(replay.runtime, 'replayExample.runtime', ['decomposition', 'repair-recovery', 'workflow'] as const),
    adoId: expectId(replay.adoId, 'replayExample.adoId', createAdoId),
    runId: expectString(replay.runId, 'replayExample.runId'),
    sessionId: expectOptionalString(replay.sessionId, 'replayExample.sessionId') ?? null,
    createdAt: expectString(replay.createdAt, 'replayExample.createdAt'),
    taskFingerprint: expectString(replay.taskFingerprint, 'replayExample.taskFingerprint'),
    knowledgeFingerprint: expectString(replay.knowledgeFingerprint, 'replayExample.knowledgeFingerprint'),
    fragmentIds: expectStringArray(replay.fragmentIds ?? [], 'replayExample.fragmentIds'),
    receiptRefs: expectStringArray(replay.receiptRefs ?? [], 'replayExample.receiptRefs'),
    graphNodeIds: expectStringArray(replay.graphNodeIds ?? [], 'replayExample.graphNodeIds'),
    selectorRefs: expectStringArray(replay.selectorRefs ?? [], 'replayExample.selectorRefs'),
  };
}

export function validateTrainingCorpusManifest(value: unknown): TrainingCorpusManifest {
  const manifest = expectRecord(value, 'trainingCorpusManifest');
  return {
    kind: expectEnum(manifest.kind, 'trainingCorpusManifest.kind', ['training-corpus-manifest'] as const),
    version: expectEnum(String(manifest.version ?? '1'), 'trainingCorpusManifest.version', ['1'] as const) as unknown as 1,
    generatedAt: expectString(manifest.generatedAt, 'trainingCorpusManifest.generatedAt'),
    corpora: expectArray(manifest.corpora ?? [], 'trainingCorpusManifest.corpora').map((entry, index) => {
      const corpus = expectRecord(entry, `trainingCorpusManifest.corpora[${index}]`);
      return {
        runtime: expectEnum(corpus.runtime, `trainingCorpusManifest.corpora[${index}].runtime`, ['decomposition', 'repair-recovery', 'workflow'] as const),
        exampleCount: expectNumber(corpus.exampleCount ?? 0, `trainingCorpusManifest.corpora[${index}].exampleCount`),
        artifactPaths: expectStringArray(corpus.artifactPaths ?? [], `trainingCorpusManifest.corpora[${index}].artifactPaths`),
        lastGeneratedAt: expectOptionalString(corpus.lastGeneratedAt, `trainingCorpusManifest.corpora[${index}].lastGeneratedAt`) ?? null,
      };
    }),
    replayExamples: expectNumber(manifest.replayExamples ?? 0, 'trainingCorpusManifest.replayExamples'),
    scenarioIds: expectArray(manifest.scenarioIds ?? [], 'trainingCorpusManifest.scenarioIds').map((entry, index) =>
      expectId(entry, `trainingCorpusManifest.scenarioIds[${index}]`, createAdoId),
    ),
    runIds: expectStringArray(manifest.runIds ?? [], 'trainingCorpusManifest.runIds'),
  };
}
