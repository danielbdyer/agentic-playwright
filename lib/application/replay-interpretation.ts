import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import type { InterpretationDriftRecord, ResolutionReceipt, ScenarioTaskPacket } from '../domain/types';
import type { ProjectPaths } from './paths';
import { interpretationDriftPath, interpretationPath, resolutionGraphPath, taskPacketPath } from './paths';
import { FileSystem, RuntimeScenarioRunner } from './ports';
import { loadWorkspaceCatalog } from './catalog';
import { selectRunContext } from './execution/select-run-context';
import { interpretScenarioTaskPacket } from './execution/interpret';
import { emitOperatorInbox } from './inbox';
import { projectBenchmarkScorecard } from './benchmark';
import { buildDerivedGraph } from './graph';

interface InterpretationRecord {
  kind: 'scenario-interpretation-record';
  adoId: AdoId;
  runId: string;
  steps: Array<{ stepIndex: number; interpretation: ResolutionReceipt }>;
}

function targetKey(receipt: ResolutionReceipt): string {
  if (receipt.kind === 'needs-human') {
    return 'needs-human';
  }
  return JSON.stringify(receipt.target);
}

function exhaustionPath(receipt: ResolutionReceipt): string[] {
  return receipt.exhaustion.map((entry) => `${entry.stage}:${entry.outcome}`);
}


function resolutionGraphDigest(receipt: ResolutionReceipt): string {
  const graph = receipt.resolutionGraph;
  if (!graph) {
    return 'none';
  }
  return JSON.stringify({
    traversal: graph.precedenceTraversal.map((entry) => `${entry.rung}:${entry.outcome}`),
    winner: graph.winner,
    refs: graph.refs,
    links: graph.links,
  });
}

function createDriftRecord(input: {
  adoId: AdoId;
  runId: string;
  providerId: string;
  mode: string;
  current: InterpretationRecord;
  previous: InterpretationRecord | null;
  taskPacket: ScenarioTaskPacket;
  taskPacketArtifactPath: string;
}): InterpretationDriftRecord {
  const previousByStep = new Map((input.previous?.steps ?? []).map((step) => [step.stepIndex, step.interpretation] as const));
  const stepDrift = input.current.steps.map((step) => {
    const prior = previousByStep.get(step.stepIndex) ?? null;
    const next = step.interpretation;
    const beforeExhaustion = prior ? exhaustionPath(prior) : [];
    const afterExhaustion = exhaustionPath(next);
    const changes: InterpretationDriftRecord['steps'][number]['changes'] = [];
    const beforeGraphDigest = prior ? resolutionGraphDigest(prior) : 'none';
    const afterGraphDigest = resolutionGraphDigest(next);

    if ((prior?.winningSource ?? 'none') !== next.winningSource) {
      changes.push({ field: 'winningSource', before: prior?.winningSource ?? 'none', after: next.winningSource });
    }
    if ((prior ? targetKey(prior) : 'none') !== targetKey(next)) {
      changes.push({ field: 'target', before: prior ? targetKey(prior) : 'none', after: targetKey(next) });
    }
    if ((prior?.governance ?? 'approved') !== next.governance) {
      changes.push({ field: 'governance', before: prior?.governance ?? 'approved', after: next.governance });
    }
    if ((prior?.confidence ?? 'unbound') !== next.confidence) {
      changes.push({ field: 'confidence', before: prior?.confidence ?? 'unbound', after: next.confidence });
    }
    if (JSON.stringify(beforeExhaustion) !== JSON.stringify(afterExhaustion)) {
      changes.push({ field: 'exhaustion-path', before: beforeExhaustion, after: afterExhaustion });
    }
    if (beforeGraphDigest !== afterGraphDigest) {
      changes.push({ field: 'resolution-graph', before: beforeGraphDigest, after: afterGraphDigest });
    }

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
      knowledge: firstReceipt?.knowledgeFingerprint ?? input.taskPacket.payload.knowledgeFingerprint,
      controls: firstReceipt?.fingerprints.controls ?? null,
      task: input.taskPacket.taskFingerprint,
      run: input.runId,
    },
    lineage: {
      sources: [input.taskPacketArtifactPath],
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
      taskFingerprint: input.taskPacket.taskFingerprint,
      knowledgeFingerprint: firstReceipt?.knowledgeFingerprint ?? input.taskPacket.payload.knowledgeFingerprint,
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
    const runtimeScenarioRunner = yield* RuntimeScenarioRunner;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const selectedContext = selectRunContext({
      adoId: options.adoId,
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

    const taskPacket = (yield* fs.readJson(taskPacketPath(options.paths, options.adoId))) as ScenarioTaskPacket;
    const executionStage = yield* interpretScenarioTaskPacket({
      runtimeScenarioRunner,
      rootDir: options.paths.rootDir,
      adoId: options.adoId,
      runId: selectedContext.runId,
      taskPacket,
      mode: selectedContext.mode,
      providerId: selectedContext.providerId,
      screenIds: selectedContext.screenIds,
      fixtures: selectedContext.fixtures,
      controlSelection: {
        runbook: selectedContext.activeRunbook?.name ?? null,
        dataset: selectedContext.activeDataset?.name ?? null,
        resolutionControl: selectedContext.activeRunbook?.resolutionControl ?? null,
      },
      steps: selectedContext.steps,
      resolutionContext: selectedContext.resolutionContext,
      posture: selectedContext.posture,
      context: selectedContext.context,
      recoveryPolicy: selectedContext.recoveryPolicy,
      translationOptions: {
        disableTranslation: !selectedContext.translationEnabled,
        disableTranslationCache: !selectedContext.translationCacheEnabled,
      },
    });

    const interpretationFile = interpretationPath(options.paths, options.adoId, selectedContext.runId);
    const resolutionGraphFile = resolutionGraphPath(options.paths, options.adoId, selectedContext.runId);
    yield* fs.writeJson(interpretationFile, executionStage.interpretationOutput);
    yield* fs.writeJson(resolutionGraphFile, executionStage.resolutionGraphOutput);

    const priorRaw = priorRun ? yield* fs.readJson(interpretationPath(options.paths, options.adoId, priorRun.runId)) : null;
    const priorRecord = isInterpretationRecord(priorRaw) ? priorRaw : null;
    const drift = createDriftRecord({
      adoId: options.adoId,
      runId: selectedContext.runId,
      providerId: selectedContext.providerId,
      mode: selectedContext.mode,
      current: executionStage.interpretationOutput,
      previous: priorRecord,
      taskPacket,
      taskPacketArtifactPath: taskPacketPath(options.paths, options.adoId),
    });

    const driftFile = interpretationDriftPath(options.paths, options.adoId, selectedContext.runId);
    yield* fs.writeJson(driftFile, drift);

    const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: options.adoId } });
    const graph = yield* buildDerivedGraph({ paths: options.paths });
    for (const benchmark of catalog.benchmarks) {
      yield* projectBenchmarkScorecard({ paths: options.paths, benchmarkName: benchmark.artifact.name, includeExecution: false });
    }

    return {
      runId: selectedContext.runId,
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
