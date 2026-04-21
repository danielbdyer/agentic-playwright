import path from 'path';
import { Effect } from 'effect';
import { ImprovementRunStore } from '../../product/application/ports';
import type { ProjectPaths } from '../../product/application/paths';
import {
  improvementLedgerPath,
  loadImprovementLedger,
  saveImprovementLedger,
  toExperimentRecord,
} from '../../product/application/improvement/ledger';
import type { PipelineConfig } from '../../product/domain/attention/pipeline-config';
import type { PipelineFitnessReport, PipelineImprovementTarget } from '../../product/domain/fitness/types';
import { foldImprovementTarget } from '../../product/domain/kernel/visitors';
import type {
  InterventionReceipt,
  InterventionTarget,
  Participant,
  ParticipantRef,
} from '../../product/domain/handshake/intervention';
import { createSemanticCore } from '../../product/domain/handshake/semantic-core';
import type { ExperimentRecord } from '../../product/domain/improvement/experiment';
import type {
  AcceptanceDecision,
  CandidateIntervention,
  ExperimentScorecardComparison,
  ImprovementIteration,
  ImprovementLedger,
  ImprovementLineageEntry,
  ImprovementLoopIteration,
  ImprovementLoopLedger,
  ImprovementRun,
  ImprovementSignal,
  ObjectiveVector,
  SubstrateContext,
} from '../../product/domain/improvement/types';
import { checkpointRun, createImprovementRun } from '../../product/domain/aggregates/improvement-run';

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
  const gateHitRate = report.metrics.effectiveHitRate ?? report.metrics.knowledgeHitRate;
  const pipelineFitness = round4(
    (
      gateHitRate +
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

function targetPathsForSignal(target: PipelineImprovementTarget): readonly string[] {
  // Exhaustive fold over PipelineImprovementTarget. Previously this
  // function accepted `string` with a `default: []` fallback — new
  // target kinds would silently produce empty guidance paths. The
  // existing foldImprovementTarget at product/domain/kernel/visitors.ts
  // already exhaustively covers the 5 variants.
  return foldImprovementTarget(target, {
    translation: () => ['product/application/translation-provider.ts'],
    resolution: () => ['product/runtime/resolution/resolution-stages.ts', 'product/application/interface-intelligence.ts'],
    recovery: () => ['product/runtime/scenario.ts'],
    scoring: () => ['product/application/fitness.ts', 'product/application/knob-search.ts'],
    trustPolicy: () => ['product/application/trust-policy.ts'],
  });
}

function failureSignals(input: BuildImprovementRunInput): readonly ImprovementSignal[] {
  const totalSteps = input.fitnessReport.failureModes.reduce((sum, mode) => sum + mode.affectedSteps, 0);
  return input.fitnessReport.failureModes.map((mode, index) => ({
    signalId: `${resolvedImprovementRunId(input)}:signal:failure:${index + 1}`,
    kind: 'failure-mode' as const,
    summary: `${mode.class} surfaced ${mode.count} times`,
    detail: mode.improvementTarget.detail,
    severity: signalSeverity(mode.affectedSteps, totalSteps),
    targetPaths: targetPathsForSignal(mode.improvementTarget),
    interventionKinds: ['self-improvement-action'],
    metrics: {
      count: mode.count,
      affectedSteps: mode.affectedSteps,
    },
  }));
}

/** The closed set of health dimension names surfaced by
 *  `healthDimensionSignals`. The `dims` array in that function is
 *  the single source of truth for the variants; this type is the
 *  typed alias for the string literals it uses. */
type HealthDimensionName =
  | 'timingRegression'
  | 'selectorFlakiness'
  | 'consoleNoise'
  | 'recoveryEfficiency'
  | 'costEfficiency'
  | 'rungStability'
  | 'componentMaturity';

function targetPathsForHealthDimension(name: HealthDimensionName): readonly string[] {
  // Exhaustive switch — no default. Previously `name: string` with
  // a `default: []` fallback, which silently returned empty
  // guidance paths for any unexpected dimension. Tightening the
  // parameter type forces every caller to pass a known dimension
  // name and makes adding a new dimension a compile-time error
  // at both the dispatch site and the `dims` array below.
  switch (name) {
    case 'timingRegression': return ['product/application/timing-baseline.ts'];
    case 'selectorFlakiness': return ['product/application/selector-health.ts', 'knowledge/screens/'];
    case 'consoleNoise': return ['product/application/console-intelligence.ts'];
    case 'recoveryEfficiency': return ['product/application/recovery-effectiveness.ts', 'product/runtime/recovery-strategies.ts'];
    case 'costEfficiency': return ['product/application/execution-cost.ts'];
    case 'rungStability': return ['product/application/rung-drift.ts', 'knowledge/surfaces/'];
    case 'componentMaturity': return ['product/domain/projection/component-maturation.ts', 'knowledge/components/'];
  }
}

function healthDimensionSignals(input: BuildImprovementRunInput): readonly ImprovementSignal[] {
  const lastIteration = input.ledger.iterations[input.ledger.iterations.length - 1];
  const ls = lastIteration?.learningSignals;
  if (!ls) return [];

  const maturity = 1 - 1 / (1 + lastIteration.iteration / 3);
  const runId = resolvedImprovementRunId(input);

  const dims: readonly { readonly name: HealthDimensionName; readonly value: number; readonly lowerIsBetter: boolean }[] = [
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
      targetPaths: ['product/application/fitness.ts', 'product/application/improvement.ts'],
      interventionKinds: ['self-improvement-action', 'benchmark-action'],
      metrics: {
        effectiveHitRateDelta: input.scorecardComparison.effectiveHitRateDelta,
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
      targetPaths: ['product/application/dogfood.ts', 'product/application/improvement.ts'],
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
        pipelineFitness: input.scorecardComparison.effectiveHitRateDelta,
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
    handoff: {
      unresolvedIntent: 'Evaluate whether the latest recursive-improvement cycle produced a governed scorecard win.',
      attemptedStrategies: ['benchmark-action', 'self-improvement-action'],
      evidenceSlice: {
        artifactPaths: [
          improvementLedgerPath(input.paths),
          scorecardPath(input.paths),
        ],
        summaries: [input.scorecardSummary],
      },
      blockageType: 'self-improvement',
      requestedParticipation: input.scorecardComparison.improved ? 'verify' : 'choose',
      requiredCapabilities: ['inspect-artifacts', 'run-benchmarks', 'optimize-pipeline'],
      requiredAuthorities: input.scorecardComparison.improved
        ? ['change-pipeline']
        : ['change-pipeline', 'defer-work-item'],
      blastRadius: 'review-bound',
      epistemicStatus: input.scorecardComparison.improved ? 'approved' : 'review-required',
      semanticCore: createSemanticCore({
        namespace: 'improvement-run',
        summary: `Recursive improvement evaluation for ${input.pipelineVersion}`,
        stableFields: {
          improvementRunId: resolvedImprovementRunId(input),
          pipelineVersion: input.pipelineVersion,
          parentExperimentId: input.parentExperimentId,
          improved: input.scorecardComparison.improved,
          decisionId: decision.decisionId,
        },
      }),
      staleness: {
        observedAt: input.completedAt ?? input.fitnessReport.runAt,
        reviewBy: null,
        status: 'fresh',
        rationale: 'Fresh recursive-improvement receipt awaiting validation or next action.',
      },
      nextMoves: input.scorecardComparison.improved
        ? [{
            action: 'Verify the new scorecard high-water mark',
            rationale: 'A governed win should be inspected to confirm the acceptance story and checkpoint lineage.',
            command: null,
          }, {
            action: 'Inspect regional improvements',
            rationale: 'Check whether the accepted changes improved the targeted screens, routes, or affordance families.',
            command: null,
          }]
        : [{
            action: 'Inspect top failure modes',
            rationale: 'Use the current failure stack to pick the highest-leverage next intervention.',
            command: null,
          }, {
            action: 'Choose the next candidate intervention',
            rationale: 'The recursive loop surfaced multiple candidate moves; select the one with the best expected downstream leverage.',
            command: null,
          }],
      competingCandidates: candidates.slice(0, 3).map((candidate) => ({
        ref: candidate.candidateId,
        summary: candidate.rationale,
        source: candidate.kind,
        status: 'review-required' as const,
      })),
      tokenImpact: {
        payloadSizeBytes: input.scorecardSummary.length,
        estimatedReadTokens: Math.max(1, Math.ceil(input.scorecardSummary.length / 4)),
        rungImprovement: input.scorecardComparison.effectiveHitRateDelta,
      },
      chain: {
        depth: 1,
        previousSemanticToken: null,
        semanticCorePreserved: true,
        driftDetectable: true,
        competingCandidateCount: Math.min(candidates.length, 3),
      },
    },
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

export { improvementLedgerPath, loadImprovementLedger, saveImprovementLedger, toExperimentRecord };

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

export function recordImprovementRun(options: {
  readonly paths: ProjectPaths;
  readonly run: ImprovementRun;
}) {
  return Effect.gen(function* () {
    const repository = yield* ImprovementRunStore;
    return yield* Effect.promise(() => repository.appendRun(improvementLedgerPath(options.paths), options.run));
  });
}
