import type { PipelineConfig } from './pipeline-config';
import type { PipelineFitnessReport, RungRate } from './fitness';
import type { BottleneckWeights } from '../types';
import type {
  InterventionKind,
  InterventionReceipt,
  InterventionTarget,
  Participant,
  ParticipantRef,
} from './intervention';

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
}

export interface ExperimentScorecardComparison {
  readonly improved: boolean;
  readonly knowledgeHitRateDelta: number;
  readonly translationPrecisionDelta: number;
  readonly convergenceVelocityDelta: number;
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
  return {
    kind: 'improvement-ledger',
    version: 1,
    runs: [],
  };
}

export function appendImprovementRun(
  ledger: ImprovementLedger,
  run: ImprovementRun,
): ImprovementLedger {
  return {
    ...ledger,
    runs: [...ledger.runs, run],
  };
}

export function acceptedImprovementRuns(
  ledger: ImprovementLedger,
): readonly ImprovementRun[] {
  return ledger.runs.filter((run) => run.accepted);
}
