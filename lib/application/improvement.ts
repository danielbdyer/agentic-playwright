import path from 'path';
import { Effect } from 'effect';
import { ImprovementRunStore } from './ports';
import type { ProjectPaths } from './paths';
import type {
  AcceptanceDecision,
  CandidateIntervention,
  ImprovementLoopIteration,
  ImprovementLoopLedger,
  ExperimentRecord,
  ExperimentScorecardComparison,
  ImprovementIteration,
  ImprovementLedger,
  ImprovementLineageEntry,
  ImprovementRun,
  ImprovementSignal,
  InterventionReceipt,
  InterventionTarget,
  ObjectiveVector,
  Participant,
  ParticipantRef,
  PipelineConfig,
  PipelineFitnessReport,
  SubstrateContext,
} from '../domain/types';
import { checkpointRun, createImprovementRun } from '../domain/aggregates/improvement-run';

export interface BuildImprovementRunInput {
  readonly paths: ProjectPaths;
  readonly pipelineVersion: string;
  readonly baselineConfig: PipelineConfig;
  readonly configDelta: Partial<PipelineConfig>;
  readonly substrateContext: SubstrateContext;
  readonly fitnessReport: PipelineFitnessReport;
  readonly scorecardComparison: ExperimentScorecardComparison;
  readonly scorecardSummary: string;
  readonly ledger: ImprovementLoopLedger<string>;
  readonly parentExperimentId: string | null;
  readonly tags?: readonly string[] | undefined;
  readonly improvementRunId?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly completedAt?: string | null | undefined;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function improvementTarget(input: BuildImprovementRunInput): InterventionTarget {
  return {
    kind: 'codebase',
    ref: `pipeline:${input.pipelineVersion}`,
    label: `Pipeline ${input.pipelineVersion}`,
    artifactPath: input.paths.rootDir,
  };
}

function scorecardTarget(input: BuildImprovementRunInput): InterventionTarget {
  return {
    kind: 'benchmark',
    ref: 'benchmark:pipeline-scorecard',
    label: 'Pipeline scorecard',
    artifactPath: scorecardPath(input.paths),
  };
}

function optimizerParticipant(input: BuildImprovementRunInput): Participant {
  return {
    participantId: 'optimizer:recursive-improvement',
    kind: 'optimizer',
    label: 'Recursive Improvement Loop',
    providerId: 'tesseract',
    adapterId: 'speedrun',
    capabilities: ['optimize-pipeline', 'run-benchmarks'],
    metadata: {
      substrate: input.substrateContext.substrate,
      seed: input.substrateContext.seed,
    },
  };
}

function benchmarkRunnerParticipant(input: BuildImprovementRunInput): Participant {
  return {
    participantId: 'benchmark-runner:speedrun',
    kind: 'benchmark-runner',
    label: 'Speedrun Benchmark Runner',
    providerId: 'tesseract',
    adapterId: 'dogfood',
    capabilities: ['run-benchmarks', 'replay-runs'],
    metadata: {
      maxIterations: input.ledger.maxIterations,
      scenarioCount: input.substrateContext.scenarioCount,
    },
  };
}

function objectiveVectorFromLedger(
  report: PipelineFitnessReport,
  ledger: ImprovementLoopLedger<string>,
): ObjectiveVector {
  const pipelineFitness = round4(
    (
      report.metrics.knowledgeHitRate +
      report.metrics.translationPrecision +
      report.metrics.proposalYield +
      report.metrics.recoverySuccessRate
    ) / 4,
  );
  const architectureFitness = round4(
    (
      (1 - report.metrics.degradedLocatorRate) +
      report.metrics.proposalYield +
      report.metrics.translationRecall
    ) / 3,
  );
  const iterationPressure = ledger.maxIterations > 0
    ? Math.max(0, (ledger.completedIterations - 1) / ledger.maxIterations)
    : 0;
  const operatorCost = round4(
    (
      report.metrics.degradedLocatorRate +
      (1 - report.metrics.proposalYield) +
      iterationPressure
    ) / 3,
  );
  return {
    pipelineFitness,
    architectureFitness,
    operatorCost,
  };
}

function iterationObjectiveVector(iteration: ImprovementLoopIteration): ObjectiveVector {
  const resolvedRate = iteration.totalStepCount > 0
    ? 1 - (iteration.unresolvedStepCount / iteration.totalStepCount)
    : 1;
  const instructionLoad = iteration.totalStepCount > 0
    ? Math.min(1, iteration.instructionCount / iteration.totalStepCount)
    : 0;
  const blockedRate = (iteration.proposalsActivated + iteration.proposalsBlocked) > 0
    ? iteration.proposalsBlocked / (iteration.proposalsActivated + iteration.proposalsBlocked)
    : 0;

  // Health penalty: penalize architectureFitness when execution health is degraded.
  // Dampened by signal maturity to avoid distortion from early noisy signals.
  const ls = iteration.learningSignals;
  const maturity = ls ? (1 - 1 / (1 + iteration.iteration / 3)) : 0;
  const healthPenalty = ls
    ? round4((1 - ls.compositeHealthScore) * maturity * 0.15)
    : 0;

  return {
    pipelineFitness: round4(iteration.knowledgeHitRate),
    architectureFitness: round4(Math.max(0, resolvedRate - healthPenalty)),
    operatorCost: round4((instructionLoad + blockedRate) / 2),
  };
}

function signalSeverity(
  affectedSteps: number,
  totalSteps: number,
): 'info' | 'warn' | 'error' {
  const ratio = totalSteps > 0 ? affectedSteps / totalSteps : 0;
  return ratio >= 0.3 ? 'error' : ratio >= 0.1 ? 'warn' : 'info';
}

function targetPathsForSignal(targetKind: string): readonly string[] {
  switch (targetKind) {
    case 'translation':
      return ['lib/application/translation-provider.ts'];
    case 'resolution':
      return ['lib/runtime/agent/resolution-stages.ts', 'lib/application/interface-intelligence.ts'];
    case 'recovery':
      return ['lib/runtime/scenario.ts'];
    case 'scoring':
      return ['lib/application/fitness.ts', 'lib/application/knob-search.ts'];
    case 'trust-policy':
      return ['lib/application/trust-policy.ts'];
    default:
      return [];
  }
}

function failureSignals(input: BuildImprovementRunInput): readonly ImprovementSignal[] {
  const totalSteps = input.fitnessReport.failureModes.reduce((sum, mode) => sum + mode.affectedSteps, 0);
  return input.fitnessReport.failureModes.map((mode, index) => ({
    signalId: `${resolvedImprovementRunId(input)}:signal:failure:${index + 1}`,
    kind: 'failure-mode' as const,
    summary: `${mode.class} surfaced ${mode.count} times`,
    detail: mode.improvementTarget.detail,
    severity: signalSeverity(mode.affectedSteps, totalSteps),
    targetPaths: targetPathsForSignal(mode.improvementTarget.kind),
    interventionKinds: ['self-improvement-action'],
    metrics: {
      count: mode.count,
      affectedSteps: mode.affectedSteps,
    },
  }));
}

function targetPathsForHealthDimension(name: string): readonly string[] {
  switch (name) {
    case 'timingRegression': return ['lib/application/timing-baseline.ts'];
    case 'selectorFlakiness': return ['lib/application/selector-health.ts', 'knowledge/screens/'];
    case 'consoleNoise': return ['lib/application/console-intelligence.ts'];
    case 'recoveryEfficiency': return ['lib/application/recovery-effectiveness.ts', 'lib/runtime/recovery-strategies.ts'];
    case 'costEfficiency': return ['lib/application/execution-cost.ts'];
    case 'rungStability': return ['lib/application/rung-drift.ts', 'knowledge/surfaces/'];
    case 'componentMaturity': return ['lib/domain/projection/component-maturation.ts', 'knowledge/components/'];
    default: return [];
  }
}

function healthDimensionSignals(input: BuildImprovementRunInput): readonly ImprovementSignal[] {
  const lastIteration = input.ledger.iterations[input.ledger.iterations.length - 1];
  const ls = lastIteration?.learningSignals;
  if (!ls) return [];

  const maturity = 1 - 1 / (1 + lastIteration.iteration / 3);
  const runId = resolvedImprovementRunId(input);

  const dims: readonly { readonly name: string; readonly value: number; readonly lowerIsBetter: boolean }[] = [
    { name: 'timingRegression', value: ls.timingRegressionRate, lowerIsBetter: true },
    { name: 'selectorFlakiness', value: ls.selectorFlakinessRate, lowerIsBetter: true },
    { name: 'consoleNoise', value: ls.consoleNoiseLevel, lowerIsBetter: true },
    { name: 'recoveryEfficiency', value: ls.recoveryEfficiency, lowerIsBetter: false },
    { name: 'costEfficiency', value: ls.costEfficiency, lowerIsBetter: false },
    { name: 'rungStability', value: ls.rungStability, lowerIsBetter: false },
    { name: 'componentMaturity', value: ls.componentMaturityRate, lowerIsBetter: false },
  ];

  return dims
    .filter((d) => d.lowerIsBetter ? d.value > 0.3 : d.value < 0.5)
    .map((d, index) => ({
      signalId: `${runId}:signal:health:${d.name}:${index}`,
      kind: 'architecture-fitness' as const,
      summary: `Execution health dimension "${d.name}" is degraded (${d.value.toFixed(2)})`,
      detail: `Signal maturity: ${maturity.toFixed(2)}. ${d.lowerIsBetter ? 'Lower is better' : 'Higher is better'}.`,
      severity: (maturity > 0.5 ? 'warn' : 'info') as 'info' | 'warn',
      targetPaths: targetPathsForHealthDimension(d.name),
      interventionKinds: ['self-improvement-action'] as const,
      metrics: { value: d.value, maturity },
    }));
}

function improvementSignals(input: BuildImprovementRunInput): readonly ImprovementSignal[] {
  const baseSignals: readonly ImprovementSignal[] = [
    {
      signalId: `${resolvedImprovementRunId(input)}:signal:objective-delta`,
      kind: 'objective-delta',
      summary: input.scorecardComparison.improved
        ? 'Objective vector improved against the governed scorecard gate.'
        : 'Objective vector did not clear the governed scorecard gate.',
      detail: input.scorecardSummary,
      severity: input.scorecardComparison.improved ? 'info' : 'warn',
      targetPaths: ['lib/application/fitness.ts', 'lib/application/improvement.ts'],
      interventionKinds: ['self-improvement-action', 'benchmark-action'],
      metrics: {
        knowledgeHitRateDelta: input.scorecardComparison.knowledgeHitRateDelta,
        translationPrecisionDelta: input.scorecardComparison.translationPrecisionDelta,
        convergenceVelocityDelta: input.scorecardComparison.convergenceVelocityDelta,
      },
    },
    {
      signalId: `${resolvedImprovementRunId(input)}:signal:operator-cost`,
      kind: 'operator-cost',
      summary: 'Operator and system cost remained visible in the recursive-improvement loop.',
      detail: `Completed ${input.ledger.completedIterations} iterations and ${input.ledger.totalInstructionCount} instructions.`,
      severity: input.ledger.completedIterations > 1 || input.ledger.totalInstructionCount > 0 ? 'warn' : 'info',
      targetPaths: ['lib/application/dogfood.ts', 'lib/application/improvement.ts'],
      interventionKinds: ['self-improvement-action'],
      metrics: {
        completedIterations: input.ledger.completedIterations,
        totalInstructionCount: input.ledger.totalInstructionCount,
      },
    },
  ];

  return [...baseSignals, ...failureSignals(input), ...healthDimensionSignals(input)];
}

function candidateInterventions(
  input: BuildImprovementRunInput,
  signals: readonly ImprovementSignal[],
): readonly CandidateIntervention[] {
  const signalById = new Map(signals.map((signal) => [signal.signalId, signal] as const));
  return input.fitnessReport.failureModes.map((mode, index) => {
    const sourceSignalId = `${resolvedImprovementRunId(input)}:signal:failure:${index + 1}`;
    const signal = signalById.get(sourceSignalId);
    return {
      candidateId: `${resolvedImprovementRunId(input)}:candidate:${index + 1}`,
      kind: 'self-improvement-action',
      target: {
        kind: 'codebase',
        ref: `pipeline-improvement:${mode.improvementTarget.kind}`,
        label: mode.improvementTarget.detail,
      },
      rationale: mode.improvementTarget.detail,
      sourceSignalIds: signal ? [signal.signalId] : [],
      plannedChanges: [
        `Address ${mode.class}`,
        ...mode.exampleIntents.slice(0, 2).map((intent) => `Investigate ${intent}`),
      ],
      configDelta: {},
      expectedObjectiveDelta: {
        pipelineFitness: input.scorecardComparison.knowledgeHitRateDelta,
        architectureFitness: input.scorecardComparison.translationPrecisionDelta,
      },
    };
  });
}

function acceptanceVerdict(input: BuildImprovementRunInput): AcceptanceDecision['verdict'] {
  return input.scorecardComparison.improved
    ? 'accepted'
    : input.ledger.convergenceReason === 'max-iterations'
      ? 'review-required'
      : 'rejected';
}

function acceptanceDecision(
  input: BuildImprovementRunInput,
  objectiveVector: ObjectiveVector,
  participants: readonly Participant[],
  candidates: readonly CandidateIntervention[],
): AcceptanceDecision {
  const optimizer = participants.find((participant) => participant.kind === 'optimizer') ?? optimizerParticipant(input);
  return {
    decisionId: `${resolvedImprovementRunId(input)}:decision:acceptance`,
    candidateInterventionIds: candidates.map((candidate) => candidate.candidateId),
    verdict: acceptanceVerdict(input),
    decidedAt: input.completedAt ?? input.fitnessReport.runAt,
    rationale: input.scorecardSummary,
    objectiveVector,
    decidedBy: {
      participantId: optimizer.participantId,
      kind: optimizer.kind,
    },
    checkpointRef: input.scorecardComparison.improved ? scorecardPath(input.paths) : null,
  };
}

function improvementIterations(
  input: BuildImprovementRunInput,
  signals: readonly ImprovementSignal[],
  candidates: readonly CandidateIntervention[],
  decision: AcceptanceDecision,
): readonly ImprovementIteration[] {
  const finalIteration = input.ledger.iterations[input.ledger.iterations.length - 1]?.iteration ?? 0;
  return input.ledger.iterations.map((iteration) => ({
    iteration: iteration.iteration,
    scenarioIds: iteration.scenarioIds,
    proposalsActivated: iteration.proposalsActivated,
    proposalsBlocked: iteration.proposalsBlocked,
    knowledgeHitRate: iteration.knowledgeHitRate,
    unresolvedStepCount: iteration.unresolvedStepCount,
    totalStepCount: iteration.totalStepCount,
    instructionCount: iteration.instructionCount,
    objectiveVector: iterationObjectiveVector(iteration),
    signalIds: iteration.iteration === finalIteration ? signals.map((signal) => signal.signalId) : [],
    candidateInterventionIds: iteration.iteration === finalIteration ? candidates.map((candidate) => candidate.candidateId) : [],
    acceptanceDecisionIds: iteration.iteration === finalIteration ? [decision.decisionId] : [],
  }));
}

function improvementIntervention(
  input: BuildImprovementRunInput,
  participants: readonly Participant[],
  signals: readonly ImprovementSignal[],
  candidates: readonly CandidateIntervention[],
  decision: AcceptanceDecision,
): InterventionReceipt {
  const participantRefs: readonly ParticipantRef[] = participants.map((participant) => ({
    participantId: participant.participantId,
    kind: participant.kind,
  }));

  return {
    interventionId: `${resolvedImprovementRunId(input)}:intervention:self-improvement`,
    kind: 'self-improvement-action',
    status: 'completed',
    summary: `Evaluated pipeline ${input.pipelineVersion} through a governed recursive-improvement cycle.`,
    participantRefs,
    ids: {
      adoId: null,
      suite: input.paths.suiteRoot,
      sessionId: null,
      runId: null,
      stepIndex: null,
      dataset: null,
      runbook: 'synthetic-dogfood',
      resolutionControl: null,
      participantIds: participantRefs.map((participant) => participant.participantId),
      interventionIds: [`${resolvedImprovementRunId(input)}:intervention:self-improvement`],
      improvementRunId: resolvedImprovementRunId(input),
      iteration: input.ledger.completedIterations,
      parentExperimentId: input.parentExperimentId,
    },
    target: improvementTarget(input),
    plan: {
      summary: 'Run a clean-room recursive-improvement cycle and checkpoint only governed wins.',
      governance: input.scorecardComparison.improved ? 'approved' : 'review-required',
      target: improvementTarget(input),
      expectedArtifactPaths: [
        improvementLedgerPath(input.paths),
        scorecardPath(input.paths),
      ],
    },
    effects: [
      {
        kind: 'benchmark-scored',
        severity: input.scorecardComparison.improved ? 'info' : 'warn',
        summary: input.scorecardSummary,
        target: scorecardTarget(input),
        artifactPath: scorecardPath(input.paths),
        payload: {
          improved: input.scorecardComparison.improved,
        },
      },
      {
        kind: 'signal-emitted',
        severity: signals.some((signal) => signal.severity === 'error') ? 'error' : 'warn',
        summary: `Emitted ${signals.length} signals and ${candidates.length} candidate interventions.`,
        target: improvementTarget(input),
        artifactPath: improvementLedgerPath(input.paths),
        payload: {
          signalIds: signals.map((signal) => signal.signalId),
          candidateInterventionIds: candidates.map((candidate) => candidate.candidateId),
          decisionId: decision.decisionId,
        },
      },
    ],
    startedAt: input.startedAt ?? input.fitnessReport.runAt,
    completedAt: input.completedAt ?? input.fitnessReport.runAt,
    payload: {
      converged: input.ledger.converged,
      convergenceReason: input.ledger.convergenceReason,
      completedIterations: input.ledger.completedIterations,
    },
  };
}

function lineageEntries(
  input: BuildImprovementRunInput,
  signals: readonly ImprovementSignal[],
  candidates: readonly CandidateIntervention[],
  decision: AcceptanceDecision,
): readonly ImprovementLineageEntry[] {
  const timestamp = input.completedAt ?? input.fitnessReport.runAt;
  const iterationEntries = input.ledger.iterations.map((iteration) => ({
    entryId: `${resolvedImprovementRunId(input)}:lineage:iteration:${iteration.iteration}`,
    at: timestamp,
    kind: 'iteration' as const,
    summary: `Iteration ${iteration.iteration} closed with hit rate ${iteration.knowledgeHitRate}.`,
    relatedIds: [String(iteration.iteration)],
    artifactPaths: [improvementLedgerPath(input.paths)],
  }));
  const signalEntries = signals.map((signal) => ({
    entryId: `${resolvedImprovementRunId(input)}:lineage:signal:${signal.signalId}`,
    at: timestamp,
    kind: 'signal' as const,
    summary: signal.summary,
    relatedIds: [signal.signalId],
    artifactPaths: [improvementLedgerPath(input.paths)],
  }));
  const candidateEntries = candidates.map((candidate) => ({
    entryId: `${resolvedImprovementRunId(input)}:lineage:candidate:${candidate.candidateId}`,
    at: timestamp,
    kind: 'candidate' as const,
    summary: candidate.rationale,
    relatedIds: [candidate.candidateId, ...candidate.sourceSignalIds],
    artifactPaths: [improvementLedgerPath(input.paths)],
  }));
  const checkpointEntries: readonly ImprovementLineageEntry[] = input.scorecardComparison.improved
    ? [{
        entryId: `${resolvedImprovementRunId(input)}:lineage:checkpoint:scorecard`,
        at: timestamp,
        kind: 'checkpoint',
        summary: 'Scorecard checkpoint advanced after governed acceptance.',
        relatedIds: [decision.decisionId],
        artifactPaths: [scorecardPath(input.paths)],
      }]
    : [];

  return [
    ...iterationEntries,
    ...signalEntries,
    ...candidateEntries,
    {
      entryId: `${resolvedImprovementRunId(input)}:lineage:decision:${decision.decisionId}`,
      at: timestamp,
      kind: 'decision',
      summary: input.scorecardSummary,
      relatedIds: [decision.decisionId, ...decision.candidateInterventionIds],
      artifactPaths: [improvementLedgerPath(input.paths)],
    },
    ...checkpointEntries,
  ];
}

function resolvedImprovementRunId(input: BuildImprovementRunInput): string {
  return input.improvementRunId
    ?? `improvement-${(input.completedAt ?? input.fitnessReport.runAt).replace(/[:.]/g, '-')}`;
}

export function scorecardPath(paths: ProjectPaths): string {
  return path.join(paths.rootDir, '.tesseract', 'benchmarks', 'scorecard.json');
}

export function improvementLedgerPath(paths: ProjectPaths): string {
  return path.join(paths.rootDir, '.tesseract', 'benchmarks', 'improvement-ledger.json');
}

export function buildImprovementRun(input: BuildImprovementRunInput): ImprovementRun {
  const participants = [
    benchmarkRunnerParticipant(input),
    optimizerParticipant(input),
  ];
  const objectiveVector = objectiveVectorFromLedger(input.fitnessReport, input.ledger);
  const signals = improvementSignals(input);
  const candidates = candidateInterventions(input, signals);
  const decision = acceptanceDecision(input, objectiveVector, participants, candidates);
  const interventions = [
    improvementIntervention(input, participants, signals, candidates, decision),
  ];

  const baseRun = createImprovementRun({
    kind: 'improvement-run',
    version: 1,
    improvementRunId: resolvedImprovementRunId(input),
    pipelineVersion: input.pipelineVersion,
    startedAt: input.startedAt ?? input.fitnessReport.runAt,
    completedAt: input.completedAt ?? input.fitnessReport.runAt,
    tags: [...(input.tags ?? [])],
    substrateContext: input.substrateContext,
    baselineConfig: input.baselineConfig,
    configDelta: input.configDelta,
    participants,
    interventions,
    converged: input.ledger.converged,
    convergenceReason: input.ledger.convergenceReason,
    objectiveVector,
    fitnessReport: input.fitnessReport,
    scorecardComparison: input.scorecardComparison,
    iterations: improvementIterations(input, signals, candidates, decision),
    signals,
    candidateInterventions: candidates,
    acceptanceDecisions: [decision],
    lineage: lineageEntries(input, signals, candidates, decision),
    accepted: input.scorecardComparison.improved,
    parentExperimentId: input.parentExperimentId,
  });

  return input.scorecardComparison.improved
    ? checkpointRun(baseRun, {
        entryId: `${resolvedImprovementRunId(input)}:lineage:checkpoint:run`,
        at: input.completedAt ?? input.fitnessReport.runAt,
        kind: 'checkpoint',
        summary: 'Run checkpointed as accepted by governed scorecard.',
        relatedIds: [decision.decisionId],
        artifactPaths: [improvementLedgerPath(input.paths)],
      })
    : baseRun;
}

export function toExperimentRecord(run: ImprovementRun): ExperimentRecord {
  return {
    id: run.improvementRunId,
    runAt: run.completedAt ?? run.startedAt,
    pipelineVersion: run.pipelineVersion,
    baselineConfig: run.baselineConfig,
    configDelta: run.configDelta,
    substrateContext: run.substrateContext,
    fitnessReport: run.fitnessReport,
    scorecardComparison: run.scorecardComparison,
    accepted: run.accepted,
    tags: run.tags,
    parentExperimentId: run.parentExperimentId,
    improvementRunId: run.improvementRunId,
    improvementRun: run,
  };
}

export function loadImprovementLedger(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const repository = yield* ImprovementRunStore;
    return yield* Effect.promise(() => repository.loadLedger(improvementLedgerPath(paths)));
  });
}

export function saveImprovementLedger(paths: ProjectPaths, ledger: ImprovementLedger) {
  return Effect.gen(function* () {
    const repository = yield* ImprovementRunStore;
    return yield* Effect.promise(() => repository.saveLedger(improvementLedgerPath(paths), ledger));
  });
}

export function recordImprovementRun(options: {
  readonly paths: ProjectPaths;
  readonly run: ImprovementRun;
}) {
  return Effect.gen(function* () {
    const repository = yield* ImprovementRunStore;
    return yield* Effect.promise(() => repository.appendRun(improvementLedgerPath(options.paths), options.run));
  });
}
