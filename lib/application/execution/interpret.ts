import { Effect } from 'effect';
import type { AdoId, ScreenId } from '../../domain/identity';
import type {
  ExecutionPosture,
  GroundedStep,
  ResolutionGraphRecord,
  ResolutionReceipt,
  ScenarioInterpretationSurface,
  ScenarioRunPlan,
  StepResolutionGraph,
} from '../../domain/types';
import { WINNING_SOURCE_TO_RUNG } from '../../domain/visitors';
import { isApproved, mintApproved, mintReviewRequired } from '../../domain/types/workflow';
import type { RuntimeScenarioRunnerPort, RuntimeScenarioStepResult } from '../ports';
import { resolveResolutionEngine } from '../provider-registry';
import { validateStepResults } from './validate-step-results';
import type { RecoveryPolicy } from '../../domain/execution/recovery-policy';

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

function buildStepResolutionGraph(step: RuntimeScenarioStepResult, task: GroundedStep): StepResolutionGraph {
  const receipt = step.interpretation;
  const traversal = receipt.exhaustion
    .map((entry) => ({ rung: toRung(entry.stage), outcome: entry.outcome, reason: entry.reason }));
  const candidateSets = receipt.exhaustion
    .flatMap((entry) => (entry.topCandidates?.length ?? 0) > 0 ? [{
      concern: entry.topCandidates![0]!.concern,
      rung: toRung(entry.stage) as Exclude<StepResolutionGraph['winner']['rung'], 'agent-interpreted' | 'needs-human'>,
      candidates: scoreCandidates(entry.topCandidates!),
    }] : []);
  const winnerRung = (receipt.kind === 'needs-human'
    ? 'needs-human'
    : WINNING_SOURCE_TO_RUNG[receipt.winningSource]) as StepResolutionGraph['winner']['rung'];

  // Build enriched winner rationale from reason chain if available, otherwise fall back to basic.
  const reasonChainSummary = receipt.reasonChain && receipt.reasonChain.length > 0
    ? receipt.reasonChain
        .flatMap((step) => step.verdict !== 'passed' ? [`${step.rung}: ${step.verdict} — ${step.reason}`] : [])
        .join('; ')
    : null;
  const defaultRationale = receipt.kind === 'needs-human'
    ? receipt.reason
    : `Resolved via ${receipt.winningSource}.`;

  return {
    precedenceTraversal: traversal,
    candidateSets,
    winner: {
      rung: winnerRung,
      rationale: reasonChainSummary
        ? `${defaultRationale} Decision trail: ${reasonChainSummary}`
        : defaultRationale,
      losingReasons: receipt.exhaustion.flatMap((entry) => entry.outcome === 'failed' ? [entry.reason] : []),
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

export function interpretScenarioSurface(input: {
  runtimeScenarioRunner: RuntimeScenarioRunnerPort;
  rootDir: string;
  adoId: AdoId;
  runId: string;
  surface: ScenarioInterpretationSurface;
  mode: 'dry-run' | 'diagnostic' | 'playwright';
  providerId: string;
  screenIds: readonly ScreenId[];
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
  posture?: ExecutionPosture | undefined;
  translationOptions?: {
    disableTranslation?: boolean | undefined;
    disableTranslationCache?: boolean | undefined;
  } | undefined;
  steps?: readonly GroundedStep[] | undefined;
  resolutionContext: ScenarioRunPlan['resolutionContext'];
  recoveryPolicy?: RecoveryPolicy | undefined;
}) {
  const plan: ScenarioRunPlan = {
    kind: 'scenario-run-plan',
    version: 1,
    adoId: input.adoId,
    runId: input.runId,
    surfaceFingerprint: input.surface.surfaceFingerprint,
    title: input.surface.payload.title,
    suite: input.surface.payload.suite,
    controlsFingerprint: input.surface.fingerprints.controls ?? null,
    posture: input.posture ?? { interpreterMode: 'diagnostic', executionProfile: 'interactive', headed: false, writeMode: 'persist' },
    mode: input.mode,
    providerId: input.providerId,
    controlSelection: input.controlSelection ?? {},
    controlArtifactPaths: {},
    fixtures: input.fixtures,
    screenIds: [...input.screenIds],
    steps: [...(input.steps ?? input.surface.payload.steps)],
    resolutionContext: input.resolutionContext,
    context: {
      adoId: input.adoId,
      revision: input.context?.revision ?? input.surface.payload.revision,
      contentHash: input.context?.contentHash ?? input.surface.fingerprints.content ?? '',
      artifactPath: input.context?.artifactPath,
    },
    translationEnabled: !(input.translationOptions?.disableTranslation ?? false),
    translationCacheEnabled: !(input.translationOptions?.disableTranslationCache ?? false),
    recoveryPolicy: input.recoveryPolicy,
  };
  return interpretScenarioFromPlan({
    runtimeScenarioRunner: input.runtimeScenarioRunner,
    rootDir: input.rootDir,
    plan,
    knowledgeFingerprint: input.surface.payload.knowledgeFingerprint,
    controlsFingerprint: input.surface.fingerprints.controls ?? null,
    translationOptions: input.translationOptions,
  });
}

export function interpretScenarioFromPlan(input: {
  runtimeScenarioRunner: RuntimeScenarioRunnerPort;
  rootDir: string;
  suiteRoot?: string | undefined;
  plan: ScenarioRunPlan;
  knowledgeFingerprint?: string | undefined;
  controlsFingerprint?: string | null | undefined;
  translationOptions?: {
    disableTranslation?: boolean | undefined;
    disableTranslationCache?: boolean | undefined;
  } | undefined;
}) {
  return Effect.gen(function* () {
    const resolutionEngine = resolveResolutionEngine({
      providerId: input.plan.providerId,
      mode: input.plan.mode,
      translationEnabled: !(input.translationOptions?.disableTranslation ?? false),
    });

    const stepResults = yield* input.runtimeScenarioRunner.runSteps({
      rootDir: input.rootDir,
      suiteRoot: input.suiteRoot,
      plan: input.plan,
      resolutionEngine,
      translationOptions: input.translationOptions,
    });

    validateStepResults({ providerId: resolutionEngine.id, results: stepResults });

    const graphs = stepResults.map((step) => {
      const task = input.plan.steps.find((entry) => entry.index === step.interpretation.stepIndex) ?? input.plan.steps[0]!;
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
        adoId: input.plan.adoId,
        runId: input.plan.runId,
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
          adoId: input.plan.adoId,
          suite: null,
          runId: input.plan.runId,
          stepIndex: null,
          dataset: input.plan.controlSelection.dataset ?? null,
          runbook: input.plan.controlSelection.runbook ?? null,
          resolutionControl: input.plan.controlSelection.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: input.plan.runId,
          content: null,
          knowledge: input.knowledgeFingerprint ?? input.plan.resolutionContext.knowledgeFingerprint,
          controls: input.controlsFingerprint ?? null,
          task: input.plan.surfaceFingerprint,
          run: input.plan.runId,
        },
        lineage: {
          sources: [input.plan.surfaceFingerprint],
          parents: [input.plan.surfaceFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: stepResults.some((step) => !isApproved(step.interpretation)) ? mintReviewRequired() : mintApproved(),
        adoId: input.plan.adoId,
        runId: input.plan.runId,
        providerId: resolutionEngine.id,
        mode: input.plan.mode,
        generatedAt: stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
        steps: graphs,
      },
      executionOutput: {
        kind: 'scenario-execution-record',
        adoId: input.plan.adoId,
        runId: input.plan.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.execution.stepIndex,
          execution: step.execution,
        })),
      },
    } satisfies InterpretScenarioResult;
  });
}
