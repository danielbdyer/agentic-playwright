import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import type { InterpretationDriftChange, InterpretationDriftRecord, ResolutionReceipt, ScenarioInterpretationSurface } from '../domain/types';
import type { ProjectPaths } from './paths';
import { interpretationDriftPath, interpretationPath, resolutionGraphPath, taskPacketPath } from './paths';
import { FileSystem } from './ports/infrastructure-ports';
import { ExecutionScenarioRunner } from './ports/execution-ports';
import { loadWorkspaceCatalog } from './catalog';
import { loadScenarioInterpretationSurfaceFromCatalog, prepareScenarioRunPlan } from './execution/select-run-context';
import { interpretScenarioFromPlan } from './execution/interpret';
import { emitOperatorInbox } from './inbox';
import { projectBenchmarkScorecard } from './benchmark';
import { buildDerivedGraph } from './graph';

interface InterpretationRecord {
  kind: 'scenario-interpretation-record';
  adoId: AdoId;
  runId: string;
  steps: Array<{ stepIndex: number; interpretation: ResolutionReceipt }>;
}

import { targetKey, exhaustionPath, resolutionGraphDigest } from '../domain/comparison-rules';

function createDriftRecord(input: {
  adoId: AdoId;
  runId: string;
  providerId: string;
  mode: string;
  current: InterpretationRecord;
  previous: InterpretationRecord | null;
  surface: ScenarioInterpretationSurface;
  surfaceArtifactPath: string;
}): InterpretationDriftRecord {
  const previousByStep = new Map((input.previous?.steps ?? []).map((step) => [step.stepIndex, step.interpretation] as const));
  const stepDrift = input.current.steps.map((step) => {
    const prior = previousByStep.get(step.stepIndex) ?? null;
    const next = step.interpretation;
    const beforeExhaustion = prior ? exhaustionPath(prior) : [];
    const afterExhaustion = exhaustionPath(next);
    const beforeGraphDigest = prior ? resolutionGraphDigest(prior) : 'none';
    const afterGraphDigest = resolutionGraphDigest(next);

    const changes: InterpretationDriftChange[] = ([
      (prior?.winningSource ?? 'none') !== next.winningSource
        ? { field: 'winningSource' as const, before: prior?.winningSource ?? 'none', after: next.winningSource }
        : null,
      (prior ? targetKey(prior) : 'none') !== targetKey(next)
        ? { field: 'target' as const, before: prior ? targetKey(prior) : 'none', after: targetKey(next) }
        : null,
      (prior?.governance ?? 'approved') !== next.governance
        ? { field: 'governance' as const, before: prior?.governance ?? 'approved', after: next.governance }
        : null,
      (prior?.confidence ?? 'unbound') !== next.confidence
        ? { field: 'confidence' as const, before: prior?.confidence ?? 'unbound', after: next.confidence }
        : null,
      JSON.stringify(beforeExhaustion) !== JSON.stringify(afterExhaustion)
        ? { field: 'exhaustion-path' as const, before: beforeExhaustion, after: afterExhaustion }
        : null,
      beforeGraphDigest !== afterGraphDigest
        ? { field: 'resolution-graph' as const, before: beforeGraphDigest, after: afterGraphDigest }
        : null,
    ] as Array<InterpretationDriftChange | null>).filter((entry): entry is InterpretationDriftChange => entry !== null);

    return {
      stepIndex: step.stepIndex,
      changed: changes.length > 0,
      changes,
      before: {
        winningSource: prior?.winningSource ?? 'none',
        target: prior ? targetKey(prior) : 'none',
        governance: prior?.governance ?? 'approved',
        confidence: prior?.confidence ?? 'unbound',
        exhaustionPath: beforeExhaustion,
        resolutionGraphDigest: beforeGraphDigest,
      },
      after: {
        winningSource: next.winningSource,
        target: targetKey(next),
        governance: next.governance,
        confidence: next.confidence,
        exhaustionPath: afterExhaustion,
        resolutionGraphDigest: afterGraphDigest,
      },
      resolutionGraphDrift: {
        traversalPathChanged: JSON.stringify(prior?.resolutionGraph?.precedenceTraversal ?? []) !== JSON.stringify(next.resolutionGraph?.precedenceTraversal ?? []),
        winnerRungChanged: (prior?.resolutionGraph?.winner.rung ?? 'needs-human') !== (next.resolutionGraph?.winner.rung ?? 'needs-human'),
        winnerRationaleChanged: (prior?.resolutionGraph?.winner.rationale ?? 'none') !== (next.resolutionGraph?.winner.rationale ?? 'none'),
      },
    };
  });

  const changedStepCount = stepDrift.filter((entry) => entry.changed).length;
  const firstReceipt = input.current.steps[0]?.interpretation;
  const previousFirst = input.previous?.steps[0]?.interpretation;
  const knowledgeChanged = previousFirst ? previousFirst.knowledgeFingerprint !== firstReceipt?.knowledgeFingerprint : false;
  const controlsChanged = Boolean(previousFirst) && (previousFirst?.fingerprints.controls ?? null) !== (firstReceipt?.fingerprints.controls ?? null);

  return {
    kind: 'interpretation-drift-record',
    version: 1,
    stage: 'resolution',
    scope: 'run',
    ids: {
      adoId: input.adoId,
      suite: null,
      runId: input.runId,
      stepIndex: null,
      dataset: null,
      runbook: null,
      resolutionControl: null,
    },
    fingerprints: {
      artifact: input.runId,
      content: null,
      knowledge: firstReceipt?.knowledgeFingerprint ?? input.surface.payload.knowledgeFingerprint,
      controls: firstReceipt?.fingerprints.controls ?? null,
      task: input.surface.surfaceFingerprint,
      run: input.runId,
    },
    lineage: {
      sources: [input.surfaceArtifactPath],
      parents: input.previous ? [input.previous.runId] : [],
      handshakes: ['preparation', 'resolution'],
    },
    governance: changedStepCount > 0 ? 'review-required' : 'approved',
    adoId: input.adoId,
    runId: input.runId,
    comparedRunId: input.previous?.runId ?? null,
    providerId: input.providerId,
    mode: input.mode,
    comparedAt: new Date().toISOString(),
    changedStepCount,
    unchangedStepCount: stepDrift.length - changedStepCount,
    totalStepCount: stepDrift.length,
    hasDrift: changedStepCount > 0,
    provenance: {
      taskFingerprint: input.surface.surfaceFingerprint,
      knowledgeFingerprint: firstReceipt?.knowledgeFingerprint ?? input.surface.payload.knowledgeFingerprint,
      controlsFingerprint: firstReceipt?.fingerprints.controls ?? null,
      comparedTaskFingerprint: previousFirst?.taskFingerprint ?? null,
      comparedKnowledgeFingerprint: previousFirst?.knowledgeFingerprint ?? null,
      comparedControlsFingerprint: previousFirst?.fingerprints.controls ?? null,
    },
    explainableByFingerprintDelta: changedStepCount === 0 || knowledgeChanged || controlsChanged,
    steps: stepDrift,
  };
}

function isInterpretationRecord(value: unknown): value is InterpretationRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.kind === 'scenario-interpretation-record' && typeof record.runId === 'string' && Array.isArray(record.steps);
}

export function replayInterpretation(options: {
  adoId: AdoId;
  paths: ProjectPaths;
  runbookName?: string | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic' | undefined;
  providerId?: string | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const runtimeScenarioRunner = yield* ExecutionScenarioRunner;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const surfaceEntry = loadScenarioInterpretationSurfaceFromCatalog(catalog, options.adoId);
    const plan = prepareScenarioRunPlan({
      surface: surfaceEntry.artifact,
      catalog,
      paths: options.paths,
      ...(options.runbookName ? { runbookName: options.runbookName } : {}),
      ...(options.interpreterMode ? { interpreterMode: options.interpreterMode } : {}),
      ...(options.providerId ? { providerId: options.providerId } : {}),
      executionContextPosture: { interpreterMode: 'diagnostic', executionProfile: 'interactive', headed: false, writeMode: 'persist' },
    });

    const priorRun = [...catalog.runRecords]
      .filter((entry) => entry.artifact.adoId === options.adoId)
      .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))[0]?.artifact ?? null;

    const executionStage = yield* interpretScenarioFromPlan({
      runtimeScenarioRunner,
      rootDir: options.paths.rootDir,
      plan,
      knowledgeFingerprint: surfaceEntry.artifact.payload.knowledgeFingerprint,
      controlsFingerprint: surfaceEntry.artifact.fingerprints.controls ?? null,
      translationOptions: {
        disableTranslation: !plan.translationEnabled,
        disableTranslationCache: !plan.translationCacheEnabled,
      },
    });

    const interpretationFile = interpretationPath(options.paths, options.adoId, plan.runId);
    const resolutionGraphFile = resolutionGraphPath(options.paths, options.adoId, plan.runId);
    yield* fs.writeJson(interpretationFile, executionStage.interpretationOutput);
    yield* fs.writeJson(resolutionGraphFile, executionStage.resolutionGraphOutput);

    const priorRaw = priorRun ? yield* fs.readJson(interpretationPath(options.paths, options.adoId, priorRun.runId)) : null;
    const priorRecord = isInterpretationRecord(priorRaw) ? priorRaw : null;
    const drift = createDriftRecord({
      adoId: options.adoId,
      runId: plan.runId,
      providerId: plan.providerId,
      mode: plan.mode,
      current: executionStage.interpretationOutput,
      previous: priorRecord,
      surface: surfaceEntry.artifact,
      surfaceArtifactPath: taskPacketPath(options.paths, options.adoId),
    });

    const driftFile = interpretationDriftPath(options.paths, options.adoId, plan.runId);
    yield* fs.writeJson(driftFile, drift);

    const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: options.adoId } });
    const graph = yield* buildDerivedGraph({ paths: options.paths });
    yield* Effect.forEach(catalog.benchmarks, (benchmark) =>
      projectBenchmarkScorecard({ paths: options.paths, benchmarkName: benchmark.artifact.name, includeExecution: false }));

    return {
      runId: plan.runId,
      interpretationPath: interpretationFile,
      resolutionGraphPath: resolutionGraphFile,
      driftPath: driftFile,
      changedStepCount: drift.changedStepCount,
      explainableByFingerprintDelta: drift.explainableByFingerprintDelta,
      inbox,
      graph,
    };
  });
}
