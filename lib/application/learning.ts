import path from 'path';
import { Effect } from 'effect';
import type {
  BoundScenario,
  ApplicationInterfaceGraph,
  GroundedSpecFragment,
  ProposalBundle,
  ReplayExample,
  RunRecord,
  ScenarioInterpretationSurface,
  SelectorCanon,
  TrainingCorpusManifest,
} from '../domain/types';
import type { AdoId } from '../domain/kernel/identity';
import { relativeProjectPath, learningRuntimeDirPath } from './paths';
import type { ProjectPaths } from './paths';
import { FileSystem, type FileSystemPort } from './ports';
import { walkFiles } from './artifacts';

export interface LearningProjectionResult {
  manifest: TrainingCorpusManifest;
  manifestPath: string;
  artifactPaths: string[];
}

function fragmentFilePath(paths: ProjectPaths, runtime: 'decomposition' | 'repair-recovery' | 'workflow', adoId: AdoId): string {
  return path.join(learningRuntimeDirPath(paths, runtime), `${adoId}.fragments.json`);
}

function replayFilePath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(learningRuntimeDirPath(paths, 'replays'), `${adoId}.${runId}.json`);
}

function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function fragmentConfidence(step: ScenarioInterpretationSurface['payload']['steps'][number]): GroundedSpecFragment['confidence'] {
  if (step.explicitResolution) {
    return 'compiler-derived';
  }
  return 'agent-verified';
}

function decompositionFragments(input: {
  surface: ScenarioInterpretationSurface;
}): GroundedSpecFragment[] {
  return input.surface.payload.steps.map((step) => ({
    id: `decomposition:${input.surface.payload.adoId}:${step.index}`,
    runtime: 'decomposition',
    adoId: input.surface.payload.adoId,
    title: `Step ${step.index}`,
    stepIndexes: [step.index],
    action: step.explicitResolution?.action ?? step.allowedActions[0] ?? 'custom',
    intent: step.intent,
    graphNodeIds: [
      ...(step.grounding?.targetRefs.map((targetRef) => `target:${targetRef}`) ?? []),
    ],
    selectorRefs: step.grounding?.selectorRefs ?? [],
    assertionAnchors: step.grounding?.assertionAnchors ?? [],
    artifactRefs: [
      `.tesseract/tasks/${input.surface.payload.adoId}.resolution.json`,
    ],
    confidence: fragmentConfidence(step),
  }));
}

function workflowFragments(input: {
  surface: ScenarioInterpretationSurface;
}): GroundedSpecFragment[] {
  return [{
    id: `workflow:${input.surface.payload.adoId}`,
    runtime: 'workflow',
    adoId: input.surface.payload.adoId,
    title: input.surface.payload.title,
    stepIndexes: input.surface.payload.steps.map((step) => step.index),
    action: 'composite',
    intent: input.surface.payload.title,
    graphNodeIds: sortStrings(input.surface.payload.steps.flatMap((step) =>
      step.grounding?.targetRefs.map((targetRef) => `target:${targetRef}`) ?? [],
    )),
    selectorRefs: sortStrings(input.surface.payload.steps.flatMap((step) => step.grounding?.selectorRefs ?? [])),
    assertionAnchors: sortStrings(input.surface.payload.steps.flatMap((step) => step.grounding?.assertionAnchors ?? [])),
    artifactRefs: [
      `.tesseract/tasks/${input.surface.payload.adoId}.resolution.json`,
    ],
    confidence: 'compiler-derived',
  }];
}

function repairRecoveryFragments(input: {
  runRecord: RunRecord;
  proposalBundle: ProposalBundle | null;
}): GroundedSpecFragment[] {
  return input.runRecord.steps
    .flatMap((step) => step.execution.execution.status !== 'ok' || step.interpretation.kind === 'resolved-with-proposals' ? [step] : [])
    .map((step) => ({
      id: `repair-recovery:${input.runRecord.adoId}:${input.runRecord.runId}:${step.stepIndex}`,
      runtime: 'repair-recovery',
      adoId: input.runRecord.adoId,
      title: `Repair step ${step.stepIndex}`,
      stepIndexes: [step.stepIndex],
      action: step.interpretation.kind === 'needs-human' ? 'custom' : step.interpretation.target.action,
      intent: step.interpretation.kind === 'needs-human' ? step.interpretation.reason : `Repair ${step.interpretation.target.action}`,
      graphNodeIds: step.interpretation.kind === 'needs-human'
        ? []
        : [
            step.interpretation.target.screen,
            ...(step.interpretation.target.element ? [step.interpretation.target.element] : []),
          ],
      selectorRefs: [],
      assertionAnchors: [],
      artifactRefs: [
        `.tesseract/runs/${input.runRecord.adoId}/${input.runRecord.runId}/run.json`,
        ...(input.proposalBundle ? [`generated/${input.runRecord.suite}/${input.runRecord.adoId}.proposals.json`] : []),
      ],
      confidence: step.interpretation.kind === 'resolved-with-proposals' ? 'agent-proposed' : 'agent-verified',
    }));
}

function replayExample(input: {
  surface: ScenarioInterpretationSurface;
  runRecord: RunRecord;
  sessionId?: string | null | undefined;
  fragments: GroundedSpecFragment[];
}): ReplayExample {
  return {
    kind: 'replay-example',
    version: 1,
    runtime: 'workflow',
    adoId: input.runRecord.adoId,
    runId: input.runRecord.runId,
    sessionId: input.sessionId ?? null,
    createdAt: input.runRecord.completedAt,
    taskFingerprint: input.surface.surfaceFingerprint,
    knowledgeFingerprint: input.surface.payload.knowledgeFingerprint,
    fragmentIds: input.fragments.map((fragment) => fragment.id),
    receiptRefs: [
      `.tesseract/runs/${input.runRecord.adoId}/${input.runRecord.runId}/interpretation.json`,
      `.tesseract/runs/${input.runRecord.adoId}/${input.runRecord.runId}/execution.json`,
      `.tesseract/runs/${input.runRecord.adoId}/${input.runRecord.runId}/run.json`,
    ],
    graphNodeIds: sortStrings(input.fragments.flatMap((fragment) => fragment.graphNodeIds)),
    selectorRefs: sortStrings(input.fragments.flatMap((fragment) => fragment.selectorRefs)),
  };
}

function rebuildManifest(fs: FileSystemPort, paths: ProjectPaths) {
  return Effect.gen(function* () {
    const files = (yield* walkFiles(fs, paths.learningDir))
      .filter((filePath) => filePath.endsWith('.json') && path.basename(filePath) !== 'manifest.json');
    const corpora = [
      { runtime: 'decomposition' as const },
      { runtime: 'repair-recovery' as const },
      { runtime: 'workflow' as const },
    ];
    const artifactPaths = files.map((filePath) => relativeProjectPath(paths, filePath));
    const replayArtifacts = artifactPaths.filter((artifactPath) => artifactPath.includes('/replays/'));
    const scenarioIds = sortStrings(
      artifactPaths
        .flatMap((artifactPath) => { const r = artifactPath.match(/([0-9]+)(?:\.|\.fragments)/)?.[1] ?? ''; return r.length > 0 ? [r] : []; }),
    ) as AdoId[];
    const runIds = sortStrings(
      replayArtifacts
        .flatMap((artifactPath) => { const r = artifactPath.split('.').slice(-2, -1)[0] ?? ''; return r.length > 0 ? [r] : []; }),
    );
    return {
      kind: 'training-corpus-manifest' as const,
      version: 1 as const,
      generatedAt: new Date(0).toISOString(),
      corpora: corpora.map((entry) => ({
        runtime: entry.runtime,
        exampleCount: artifactPaths.filter((artifactPath) => artifactPath.includes(`/${entry.runtime}/`)).length,
        artifactPaths: artifactPaths.filter((artifactPath) => artifactPath.includes(`/${entry.runtime}/`)),
        lastGeneratedAt: new Date(0).toISOString(),
      })),
      replayExamples: replayArtifacts.length,
      scenarioIds,
      runIds,
    } satisfies TrainingCorpusManifest;
  });
}

export function projectLearningArtifacts(input: {
  paths: ProjectPaths;
  boundScenario: BoundScenario;
  surface: ScenarioInterpretationSurface;
  interfaceGraph?: ApplicationInterfaceGraph | null | undefined;
  selectorCanon?: SelectorCanon | null | undefined;
  runRecord?: RunRecord | null | undefined;
  proposalBundle?: ProposalBundle | null | undefined;
  sessionId?: string | null | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const decomposition = decompositionFragments({ surface: input.surface });
    const workflow = workflowFragments({ surface: input.surface });
    const decompositionPath = fragmentFilePath(input.paths, 'decomposition', input.surface.payload.adoId);
    const workflowPath = fragmentFilePath(input.paths, 'workflow', input.surface.payload.adoId);
    yield* Effect.all([
      fs.writeJson(decompositionPath, decomposition),
      fs.writeJson(workflowPath, workflow),
    ], { concurrency: 'unbounded' });
    const basePaths = [
      relativeProjectPath(input.paths, decompositionPath),
      relativeProjectPath(input.paths, workflowPath),
    ];

    const runRecordPaths: readonly string[] = input.runRecord
      ? yield* Effect.gen(function* () {
          const repairs = repairRecoveryFragments({
            runRecord: input.runRecord!,
            proposalBundle: input.proposalBundle ?? null,
          });
          const repairPath = fragmentFilePath(input.paths, 'repair-recovery', input.surface.payload.adoId);
          const replay = replayExample({
            surface: input.surface,
            runRecord: input.runRecord!,
            sessionId: input.sessionId,
            fragments: [...decomposition, ...workflow, ...repairs],
          });
          const replayPath = replayFilePath(input.paths, input.surface.payload.adoId, input.runRecord!.runId);
          yield* Effect.all([
            fs.writeJson(repairPath, repairs),
            fs.writeJson(replayPath, replay),
          ], { concurrency: 'unbounded' });
          return [relativeProjectPath(input.paths, repairPath), relativeProjectPath(input.paths, replayPath)];
        })
      : [];

    const manifest = yield* rebuildManifest(fs, input.paths);
    yield* fs.writeJson(input.paths.learningManifestPath, manifest);
    const rewritten = [...basePaths, ...runRecordPaths, relativeProjectPath(input.paths, input.paths.learningManifestPath)];
    return {
      manifest,
      manifestPath: input.paths.learningManifestPath,
      artifactPaths: rewritten,
    } satisfies LearningProjectionResult;
  });
}
