import type { ProgressEventLike, WorkbenchLike, ScorecardLike } from './shared';

export const LIFECYCLE_EVENT_KINDS = [
  'iteration-start',
  'iteration-complete',
  'progress',
  'screen-group-start',
  'item-pending',
  'item-processing',
  'item-completed',
  'workbench-updated',
  'fitness-updated',
  'stage-lifecycle',
] as const;

export interface IterationStartPayload {
  readonly iteration?: number;
}

export interface IterationCompletePayload {
  readonly iteration?: number;
  readonly converged?: boolean;
}

export interface ScreenGroupStartPayload {
  readonly screen: string;
  readonly adoId?: string;
}

export interface ItemPendingPayload {
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

export interface ItemProcessingPayload {
  readonly workItemId: string;
}

export interface ItemCompletedPayload {
  readonly workItemId: string;
  readonly status: string;
}

export interface StageLifecycleEvent {
  readonly stage: string;
  readonly phase: 'start' | 'complete';
  readonly durationMs?: number | undefined;
  readonly adoId?: string | undefined;
  readonly runId?: string | undefined;
  readonly iteration?: number | undefined;
  readonly workItemId?: string | undefined;
  readonly cacheStatus?: 'hit' | 'miss' | undefined;
  readonly rewrittenFiles?: readonly string[] | undefined;
}

export interface LifecycleEventMap {
  readonly 'iteration-start': IterationStartPayload;
  readonly 'iteration-complete': IterationCompletePayload;
  readonly progress: ProgressEventLike;
  readonly 'screen-group-start': ScreenGroupStartPayload;
  readonly 'item-pending': ItemPendingPayload;
  readonly 'item-processing': ItemProcessingPayload;
  readonly 'item-completed': ItemCompletedPayload;
  readonly 'workbench-updated': WorkbenchLike;
  readonly 'fitness-updated': ScorecardLike;
  readonly 'stage-lifecycle': StageLifecycleEvent;
}
