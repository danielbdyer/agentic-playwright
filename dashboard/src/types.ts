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

export type DisplayStatus = 'entering' | 'pending' | 'processing' | 'completed' | 'skipped';

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

