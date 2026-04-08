import type { PipelineConfig } from '../attention/pipeline-config';
import type { PipelineFitnessReport, RungRate } from '../fitness/types';
import type { BottleneckWeights } from '../attention/pipeline-config';
import type {
  InterventionKind,
  InterventionReceipt,
  InterventionTarget,
  Participant,
  ParticipantRef,
} from '../handshake/intervention';
import { appendImprovementRun as appendImprovementRunAggregate, emptyImprovementLedger as emptyImprovementLedgerAggregate } from '../aggregates/improvement-run';

export type ExperimentSubstrate = 'synthetic' | 'production' | 'hybrid';

export interface SubstrateContext {
  readonly substrate: ExperimentSubstrate;
  readonly seed: string;
  readonly scenarioCount: number;
  readonly screenCount: number;
  readonly phrasingTemplateVersion: string;
  readonly screenDistribution?: ReadonlyArray<{ readonly screen: string; readonly count: number }>;
}

/**
 * Structured progress event emitted during dogfood loop iterations.
 * Written as JSONL to a sidecar file and/or rendered to stderr for
 * human-readable monitoring.
 */
export interface SpeedrunProgressEvent {
  readonly kind: 'speedrun-progress';
  readonly phase: 'generate' | 'compile' | 'iterate' | 'fitness' | 'complete';
  readonly iteration: number;
  readonly maxIterations: number;
  readonly metrics: {
    readonly knowledgeHitRate: number;
    readonly proposalsActivated: number;
    readonly totalSteps: number;
    readonly unresolvedSteps: number;
    /** Per-iteration resolution-by-rung breakdown. Present when run records are available. */
    readonly resolutionByRung?: readonly RungRate[];
  } | null;
  readonly convergenceReason: ImprovementLoopConvergenceReason;
  /** Milliseconds since the speedrun started. */
  readonly elapsed: number;
  /** Milliseconds this specific phase took (null if not measured). */
  readonly phaseDurationMs: number | null;
  /** Absolute wall-clock timestamp (ms since epoch). */
  readonly wallClockMs: number;
  readonly seed: string;
  /** Scenario count for this phase (present for generate/compile/iterate phases). */
  readonly scenarioCount?: number;
  /** Self-calibrating bottleneck weights after this iteration (if calibration active). */
  readonly calibration?: {
    readonly weights: BottleneckWeights;
    /** L2 distance from previous iteration's weights. 0 on first iteration. */
    readonly weightDrift: number;
    /** Strongest correlation signal observed. */
    readonly topCorrelation: { readonly signal: string; readonly strength: number } | null;
  } | undefined;
  /** Execution health signals from intelligence modules (when available). */
  readonly executionHealth?: {
    readonly healthScore: number;
    readonly degradingDimensions: readonly string[];
    readonly maturity: number;
  } | undefined;
}

export interface ExperimentScorecardComparison {
  readonly improved: boolean;
  readonly effectiveHitRateDelta: number;
  readonly knowledgeHitRateDelta: number;
  readonly translationPrecisionDelta: number;
  readonly convergenceVelocityDelta: number;
}

/**
 * Iteration-level execution health summary derived from all intelligence modules.
 *
 * Rates are [0,1]. For "lower is better" dimensions (regression, flakiness, noise),
 * 0 = healthy. For "higher is better" dimensions (efficiency, stability, maturity),
 * 1 = healthy. compositeHealthScore is a weighted aggregate where 1 = fully healthy.
 */
export interface LearningSignalsSummary {
  readonly timingRegressionRate: number;
  readonly selectorFlakinessRate: number;
  readonly recoveryEfficiency: number;
  readonly consoleNoiseLevel: number;
  readonly costEfficiency: number;
  readonly rungStability: number;
  readonly componentMaturityRate: number;
  readonly compositeHealthScore: number;
  readonly hotScreenCount: number;
}

export interface ImprovementLoopIteration {
  readonly iteration: number;
  readonly scenarioIds: readonly string[];
  readonly proposalsGenerated: number;
  readonly proposalsActivated: number;
  readonly proposalsBlocked: number;
  readonly knowledgeHitRate: number;
  readonly unresolvedStepCount: number;
  readonly totalStepCount: number;
  readonly instructionCount: number;
  /** Execution health signals aggregated from all intelligence modules.
   *  Optional for backward compatibility with older serialized ledgers. */
  readonly learningSignals?: LearningSignalsSummary | undefined;
}

export type ImprovementLoopConvergenceReason =
  | 'no-proposals'
  | 'threshold-met'
  | 'budget-exhausted'
  | 'max-iterations'
  | null;

export interface ImprovementLoopLedger<Kind extends string = 'improvement-loop-ledger'> {
  readonly kind: Kind;
  readonly version: 1;
  readonly maxIterations: number;
  readonly completedIterations: number;
  readonly converged: boolean;
  readonly convergenceReason: ImprovementLoopConvergenceReason;
  readonly iterations: readonly ImprovementLoopIteration[];
  readonly totalProposalsActivated: number;
  readonly totalInstructionCount: number;
  readonly knowledgeHitRateDelta: number;
}

export type DogfoodLedgerProjection = ImprovementLoopLedger<'dogfood-ledger'>;

export function asImprovementLoopLedger(
  ledger: ImprovementLoopLedger<string>,
): ImprovementLoopLedger<'improvement-loop-ledger'> {
  return {
    ...ledger,
    kind: 'improvement-loop-ledger',
  };
}

export function asDogfoodLedgerProjection(
  ledger: ImprovementLoopLedger<string>,
): DogfoodLedgerProjection {
  return {
    ...ledger,
    kind: 'dogfood-ledger',
  };
}

export interface ObjectiveVector {
  readonly pipelineFitness: number;
  readonly architectureFitness: number;
  readonly operatorCost: number;
}

export type ImprovementSignalKind =
  | 'failure-mode'
  | 'objective-delta'
  | 'architecture-fitness'
  | 'governance-pressure'
  | 'operator-cost';

export interface ImprovementSignal {
  readonly signalId: string;
  readonly kind: ImprovementSignalKind;
  readonly summary: string;
  readonly detail: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly targetPaths: readonly string[];
  readonly interventionKinds: readonly InterventionKind[];
  readonly metrics: Readonly<Record<string, number>>;
}

export interface CandidateIntervention {
  readonly candidateId: string;
  readonly kind: InterventionKind;
  readonly target: InterventionTarget;
  readonly rationale: string;
  readonly sourceSignalIds: readonly string[];
  readonly plannedChanges: readonly string[];
  readonly configDelta: Readonly<Record<string, unknown>>;
  readonly expectedObjectiveDelta: Partial<ObjectiveVector>;
}

export type AcceptanceVerdict = 'accepted' | 'rejected' | 'review-required' | 'candidate';

export interface AcceptanceDecision {
  readonly decisionId: string;
  readonly candidateInterventionIds: readonly string[];
  readonly verdict: AcceptanceVerdict;
  readonly decidedAt: string;
  readonly rationale: string;
  readonly objectiveVector: ObjectiveVector;
  readonly decidedBy: ParticipantRef;
  readonly checkpointRef?: string | null | undefined;
}

export interface ImprovementIteration {
  readonly iteration: number;
  readonly scenarioIds: readonly string[];
  readonly proposalsActivated: number;
  readonly proposalsBlocked: number;
  readonly knowledgeHitRate: number;
  readonly unresolvedStepCount: number;
  readonly totalStepCount: number;
  readonly instructionCount: number;
  readonly objectiveVector: ObjectiveVector;
  readonly signalIds: readonly string[];
  readonly candidateInterventionIds: readonly string[];
  readonly acceptanceDecisionIds: readonly string[];
}

export type ImprovementLineageKind = 'iteration' | 'signal' | 'candidate' | 'decision' | 'checkpoint';

export type ImprovementConvergenceReason =
  | 'no-proposals'
  | 'threshold-met'
  | 'budget-exhausted'
  | 'max-iterations'
  | null;

export interface ImprovementLineageEntry {
  readonly entryId: string;
  readonly at: string;
  readonly kind: ImprovementLineageKind;
  readonly summary: string;
  readonly relatedIds: readonly string[];
  readonly artifactPaths: readonly string[];
}

export interface ImprovementRun {
  readonly kind: 'improvement-run';
  readonly version: 1;
  readonly improvementRunId: string;
  readonly pipelineVersion: string;
  readonly startedAt: string;
  readonly completedAt?: string | null | undefined;
  readonly tags: readonly string[];
  readonly substrateContext: SubstrateContext;
  readonly baselineConfig: PipelineConfig;
  readonly configDelta: Partial<PipelineConfig>;
  readonly participants: readonly Participant[];
  readonly interventions: readonly InterventionReceipt[];
  readonly converged: boolean;
  readonly convergenceReason: ImprovementConvergenceReason;
  readonly objectiveVector: ObjectiveVector;
  readonly fitnessReport: PipelineFitnessReport;
  readonly scorecardComparison: ExperimentScorecardComparison;
  readonly iterations: readonly ImprovementIteration[];
  readonly signals: readonly ImprovementSignal[];
  readonly candidateInterventions: readonly CandidateIntervention[];
  readonly acceptanceDecisions: readonly AcceptanceDecision[];
  readonly lineage: readonly ImprovementLineageEntry[];
  readonly accepted: boolean;
  readonly parentExperimentId: string | null;
}

export interface ImprovementLedger {
  readonly kind: 'improvement-ledger';
  readonly version: 1;
  readonly runs: readonly ImprovementRun[];
}


export function emptyImprovementLedger(): ImprovementLedger {
  return emptyImprovementLedgerAggregate();
}

export function appendImprovementRun(
  ledger: ImprovementLedger,
  run: ImprovementRun,
): ImprovementLedger {
  return appendImprovementRunAggregate(ledger, run);
}

export function acceptedImprovementRuns(
  ledger: ImprovementLedger,
): readonly ImprovementRun[] {
  return ledger.runs.filter((run) => run.accepted);
}
