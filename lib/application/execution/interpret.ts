import { Effect } from 'effect';
import type { AdoId } from '../../domain/identity';
import type { InterfaceResolutionContext, ResolutionGraphRecord, ResolutionReceipt, ScenarioTaskPacket, StepResolutionGraph, StepTask } from '../../domain/types';
import type { RuntimeScenarioRunnerPort, RuntimeScenarioStepResult } from '../ports';
import { resolveResolutionEngine } from '../provider-registry';
import { validateStepResults } from './validate-step-results';

export interface InterpretScenarioResult {
  stepResults: RuntimeScenarioStepResult[];
  interpretationOutput: {
    kind: 'scenario-interpretation-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; interpretation: RuntimeScenarioStepResult['interpretation'] }>;
  };
  resolutionGraphOutput: ResolutionGraphRecord;
  executionOutput: {
    kind: 'scenario-execution-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; execution: RuntimeScenarioStepResult['execution'] }>;
  };
}

function toRung(stage: ResolutionReceipt['exhaustion'][number]['stage']): StepResolutionGraph['precedenceTraversal'][number]['rung'] {
  return stage;
}

function scoreCandidates(candidates: NonNullable<ResolutionReceipt['exhaustion'][number]['topCandidates']>) {
  const max = candidates.reduce((best, entry) => Math.max(best, entry.score), 0);
  return candidates.map((entry, index) => ({
    concern: entry.concern,
    source: entry.source,
    value: entry.value,
    score: {
      raw: entry.score,
      normalized: max <= 0 ? 0 : Number((entry.score / max).toFixed(3)),
    },
    reason: entry.reason,
    selected: index === 0,
  }));
}

function buildStepResolutionGraph(step: RuntimeScenarioStepResult, task: StepTask): StepResolutionGraph {
  const receipt = step.interpretation;
  const traversal = receipt.exhaustion
    .map((entry) => ({ rung: toRung(entry.stage), outcome: entry.outcome, reason: entry.reason }));
  const candidateSets = receipt.exhaustion
    .filter((entry) => (entry.topCandidates?.length ?? 0) > 0)
    .map((entry) => ({
      concern: entry.topCandidates![0]!.concern,
      rung: toRung(entry.stage) as Exclude<StepResolutionGraph['winner']['rung'], 'needs-human'>,
      candidates: scoreCandidates(entry.topCandidates!),
    }));
  const winnerRung = receipt.kind === 'needs-human'
    ? 'needs-human'
    : receipt.winningSource === 'scenario-explicit'
      ? 'explicit'
      : receipt.winningSource === 'resolution-control'
        ? 'control'
        : receipt.winningSource === 'approved-equivalent'
          ? 'approved-equivalent-overlay'
          : receipt.winningSource === 'structured-translation'
            ? 'structured-translation'
            : receipt.winningSource === 'live-dom'
              ? 'live-dom'
              : receipt.winningSource === 'prior-evidence'
                ? 'prior-evidence'
                : 'approved-screen-knowledge';

  return {
    precedenceTraversal: traversal,
    candidateSets,
    winner: {
      rung: winnerRung,
      rationale: receipt.kind === 'needs-human' ? receipt.reason : `Resolved via ${receipt.winningSource}.`,
      losingReasons: (receipt.exhaustion.filter((entry) => entry.outcome === 'failed').map((entry) => entry.reason)),
    },
    refs: {
      controlRefs: receipt.controlRefs,
      knowledgeRefs: receipt.knowledgeRefs,
      supplementRefs: receipt.supplementRefs,
      evidenceRefs: receipt.evidenceRefs,
    },
    links: {
      translationReceiptRef: receipt.translation ? `translation:${task.taskFingerprint}:${task.index}` : null,
      domProbeEvidenceRef: receipt.winningSource === 'live-dom' || receipt.exhaustion.some((entry) => entry.stage === 'live-dom')
        ? `dom-probe:${task.taskFingerprint}:${task.index}`
        : null,
    },
  };
}

export function interpretScenarioTaskPacket(input: {
  runtimeScenarioRunner: RuntimeScenarioRunnerPort;
  rootDir: string;
  adoId: AdoId;
  runId: string;
  taskPacket: ScenarioTaskPacket;
  mode: 'dry-run' | 'diagnostic' | 'playwright';
  providerId: string;
  screenIds: readonly import('../../domain/identity').ScreenId[];
  fixtures: Record<string, unknown>;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  context?: {
    adoId: AdoId;
    artifactPath?: string | undefined;
    revision?: number | undefined;
    contentHash?: string | undefined;
  } | undefined;
  posture?: import('../../domain/types').ExecutionPosture | undefined;
  translationOptions?: {
    disableTranslation?: boolean | undefined;
    disableTranslationCache?: boolean | undefined;
  } | undefined;
  steps?: readonly StepTask[] | undefined;
  resolutionContext: InterfaceResolutionContext;
  recoveryPolicy?: import('../../domain/execution/recovery-policy').RecoveryPolicy | undefined;
}) {
  return Effect.gen(function* () {
    const resolutionEngine = resolveResolutionEngine({
      providerId: input.providerId,
      mode: input.mode,
      translationEnabled: !(input.translationOptions?.disableTranslation ?? false),
    });

    const activeSteps = input.steps ?? input.taskPacket.payload.steps;
    const stepResults = yield* input.runtimeScenarioRunner.runSteps({
      rootDir: input.rootDir,
      screenIds: input.screenIds,
      controlSelection: input.controlSelection,
      fixtures: input.fixtures,
      mode: input.mode,
      resolutionEngine,
      steps: activeSteps,
      resolutionContext: input.resolutionContext,
      posture: input.posture,
      recoveryPolicy: input.recoveryPolicy,
      context: input.context,
      translationOptions: input.translationOptions,
    });

    validateStepResults({ providerId: resolutionEngine.id, results: stepResults });

    const graphs = stepResults.map((step) => {
      const task = activeSteps.find((entry) => entry.index === step.interpretation.stepIndex) ?? activeSteps[0]!;
      return { stepIndex: step.interpretation.stepIndex, graph: buildStepResolutionGraph(step, task) };
    });

    return {
      stepResults: stepResults.map((step) => {
        const graph = graphs.find((entry) => entry.stepIndex === step.interpretation.stepIndex)?.graph;
        return {
          ...step,
          interpretation: {
            ...step.interpretation,
            resolutionGraph: graph,
          },
        };
      }),
      interpretationOutput: {
        kind: 'scenario-interpretation-record',
        adoId: input.adoId,
        runId: input.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.interpretation.stepIndex,
          interpretation: {
            ...step.interpretation,
            resolutionGraph: graphs.find((entry) => entry.stepIndex === step.interpretation.stepIndex)?.graph,
          },
        })),
      },
      resolutionGraphOutput: {
        kind: 'resolution-graph-record',
        version: 1,
        stage: 'resolution',
        scope: 'run',
        ids: {
          adoId: input.adoId,
          suite: null,
          runId: input.runId,
          stepIndex: null,
          dataset: input.controlSelection?.dataset ?? null,
          runbook: input.controlSelection?.runbook ?? null,
          resolutionControl: input.controlSelection?.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: input.runId,
          content: null,
          knowledge: input.taskPacket.payload.knowledgeFingerprint,
          controls: input.taskPacket.fingerprints.controls ?? null,
          task: input.taskPacket.taskFingerprint,
          run: input.runId,
        },
        lineage: {
          sources: [input.taskPacket.taskFingerprint],
          parents: [input.taskPacket.taskFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: stepResults.some((step) => step.interpretation.governance !== 'approved') ? 'review-required' : 'approved',
        adoId: input.adoId,
        runId: input.runId,
        providerId: resolutionEngine.id,
        mode: input.mode,
        generatedAt: stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
        steps: graphs,
      },
      executionOutput: {
        kind: 'scenario-execution-record',
        adoId: input.adoId,
        runId: input.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.execution.stepIndex,
          execution: step.execution,
        })),
      },
    } satisfies InterpretScenarioResult;
  });
}
