/**
 * Dashboard domain projections — REST API response schemas and queue state.
 *
 * These are lightweight projections of the pipeline's domain types
 * (lib/domain/types/workbench.ts, lib/domain/types/improvement.ts)
 * shaped for the React view layer. All fields are readonly.
 */

export interface WorkItem {
  readonly id: string;
  readonly kind: string;
  readonly priority: number;
  readonly title: string;
  readonly rationale: string;
  readonly context: {
    readonly screen?: string;
    readonly element?: string;
    readonly proposalId?: string;
    readonly artifactRefs: readonly string[];
  };
  readonly evidence: {
    readonly confidence: number;
    readonly sources: readonly string[];
  };
}

export interface Completion {
  readonly workItemId: string;
  readonly status: string;
  readonly completedAt: string;
  readonly rationale: string;
}

export interface Workbench {
  readonly generatedAt: string;
  readonly iteration: number;
  readonly items: readonly WorkItem[];
  readonly completions: readonly Completion[];
  readonly summary: {
    readonly total: number;
    readonly pending: number;
    readonly completed: number;
    readonly byKind: Readonly<Record<string, number>>;
    readonly topPriority: WorkItem | null;
  };
}

export interface Scorecard {
  readonly highWaterMark: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly convergenceVelocity: number;
    readonly proposalYield: number;
    readonly resolutionByRung?: ReadonlyArray<{
      readonly rung: string;
      readonly wins: number;
      readonly rate: number;
    }>;
  };
}

export interface ProgressEvent {
  readonly phase: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly metrics: {
    readonly knowledgeHitRate: number;
    readonly proposalsActivated: number;
    readonly totalSteps: number;
    readonly unresolvedSteps: number;
  } | null;
  readonly convergenceReason: string | null;
  readonly elapsed: number;
  readonly calibration?: {
    readonly weightDrift: number;
    readonly topCorrelation: {
      readonly signal: string;
      readonly strength: number;
    } | null;
  } | null;
}

export type DisplayStatus = 'entering' | 'pending' | 'processing' | 'completed' | 'skipped' | 'optimistic-completed' | 'optimistic-skipped';

export interface QueuedItem extends WorkItem {
  readonly displayStatus: DisplayStatus;
}

/** Context captured when the Effect fiber pauses for a human decision.
 *  Drives the 3D decision overlay: which element to highlight, what to decide. */
export interface PauseContext {
  readonly workItemId: string;
  readonly screen: string;
  readonly element: string | null;
  readonly reason: string;
}

/** Result of a decision burst animation (approve = green toward knowledge, skip = red scatter). */
export type DecisionResult = 'approved' | 'skipped';

/** Dashboard WebSocket connection state projected for UI consumption. */
export interface DashboardConnectionState {
  readonly connected: boolean;
}

/** Dashboard-level error state for display in the observation panel. */
export interface DashboardErrorState {
  readonly message: string;
  readonly code?: string;
}

/** Optimistic decision applied before server confirms. */
export interface OptimisticDecision {
  readonly workItemId: string;
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
  readonly issuedAt: number;
}

/** Input shape for submitting a work item decision. */
export interface WorkItemDecisionInput {
  readonly workItemId: string;
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
}

/** Flywheel act identifier used for replay policy and diagnostics. */
export type FlywheelAct = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Lightweight ingestion and rendering diagnostics for tuning. */
export interface DiagnosticsProjection {
  readonly throughputPerSecond: number;
  readonly coalescingRatio: number;
  readonly avgFrameTimeMs: number;
  readonly lagMs: number;
  readonly droppedFrames: number;
  readonly queueDepthByAct: Readonly<Record<FlywheelAct, number>>;
}

/** Replay-friendly snapshot of scene state for seek/jump acceleration. */
export interface SceneStateSnapshot {
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly knowledgeNodeCount: number;
  readonly activeProbeCount: number;
  readonly activeProposalCount: number;
  readonly activeArtifactCount: number;
  readonly throughputPerSecond: number;
  readonly queueDepthByAct: Readonly<Record<FlywheelAct, number>>;
}
