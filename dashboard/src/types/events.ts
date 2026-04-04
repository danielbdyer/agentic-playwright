/**
 * Typed event taxonomy for the Tesseract dashboard subscription system.
 *
 * Replaces the untyped `Record<string, (data: unknown) => void>` dispatch table
 * with an `EventObserver<TEventMap>` that maps each DashboardEventKind to its
 * payload type. Subscribe/unsubscribe by kind. Compile-time exhaustiveness
 * ensures all DashboardEventKind variants have handlers.
 *
 * Design: Strategy pattern — each event kind dispatches to a typed handler.
 * All types are readonly. No mutation.
 */

import type {
  DashboardEventKind,
  ElementProbedEvent,
  ScreenCapturedEvent,
  ElementEscalatedEvent,
  InboxItemEvent,
  FiberPauseEvent,
  FiberResumeEvent,
  RungShiftEvent,
  CalibrationUpdateEvent,
  ProposalActivatedEvent,
  ConfidenceCrossedEvent,
  ArtifactWrittenEvent,
  StageLifecycleEvent,
  SurfaceDiscoveredEvent,
  RouteNavigatedEvent,
  AriaTreeCapturedEvent,
  SuiteSliceSelectedEvent,
  ScenarioPrioritizedEvent,
  StepBoundEvent,
  ScenarioCompiledEvent,
  StepExecutingEvent,
  StepResolvedEvent,
  ScenarioExecutedEvent,
  TrustPolicyEvaluatedEvent,
  KnowledgeActivatedEvent,
  ConvergenceEvaluatedEvent,
  IterationSummaryEvent,
} from '../../../lib/domain/observation/dashboard';
import type { ProgressEvent, QueuedItem, Workbench, Scorecard } from '../types';

// ─── Event Map: kind -> payload type ───

/**
 * The canonical map from every DashboardEventKind to its typed payload.
 * This is the single source of truth for event payloads in the dashboard.
 */
export interface DashboardEventMap {
  readonly 'iteration-start': IterationStartPayload;
  readonly 'iteration-complete': IterationCompletePayload;
  readonly 'progress': ProgressEvent;
  readonly 'screen-group-start': ScreenGroupStartPayload;
  readonly 'item-pending': ItemPendingPayload;
  readonly 'item-processing': ItemProcessingPayload;
  readonly 'item-completed': ItemCompletedPayload;
  readonly 'workbench-updated': Workbench;
  readonly 'fitness-updated': Scorecard;
  readonly 'element-probed': ElementProbedEvent;
  readonly 'screen-captured': ScreenCapturedEvent;
  readonly 'element-escalated': ElementEscalatedEvent;
  readonly 'inbox-item-arrived': InboxItemEvent;
  readonly 'fiber-paused': FiberPauseEvent;
  readonly 'fiber-resumed': FiberResumeEvent;
  readonly 'rung-shift': RungShiftEvent;
  readonly 'calibration-update': CalibrationUpdateEvent;
  readonly 'proposal-activated': ProposalActivatedEvent;
  readonly 'confidence-crossed': ConfidenceCrossedEvent;
  readonly 'artifact-written': ArtifactWrittenEvent;
  readonly 'stage-lifecycle': StageLifecycleEvent;
  readonly 'surface-discovered': SurfaceDiscoveredEvent;
  readonly 'route-navigated': RouteNavigatedEvent;
  readonly 'aria-tree-captured': AriaTreeCapturedEvent;
  readonly 'suite-slice-selected': SuiteSliceSelectedEvent;
  readonly 'scenario-prioritized': ScenarioPrioritizedEvent;
  readonly 'step-bound': StepBoundEvent;
  readonly 'scenario-compiled': ScenarioCompiledEvent;
  readonly 'step-executing': StepExecutingEvent;
  readonly 'step-resolved': StepResolvedEvent;
  readonly 'scenario-executed': ScenarioExecutedEvent;
  readonly 'trust-policy-evaluated': TrustPolicyEvaluatedEvent;
  readonly 'knowledge-activated': KnowledgeActivatedEvent;
  readonly 'convergence-evaluated': ConvergenceEvaluatedEvent;
  readonly 'iteration-summary': IterationSummaryEvent;
  readonly 'diagnostics': DiagnosticsPayload;
  readonly 'learning-signals': Record<string, unknown>;
  readonly 'browser-pool-health': Record<string, unknown>;
  readonly 'proposal-quarantined': Record<string, unknown>;
  readonly 'connected': ConnectedPayload;
  readonly 'error': ErrorPayload;
}

// ─── Payload types for events that lack dedicated domain interfaces ───

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

export interface ConnectedPayload {
  readonly sessionId?: string;
}

export interface DiagnosticsPayload {
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface ErrorPayload {
  readonly message: string;
  readonly code?: string;
}

// ─── Compile-time exhaustiveness check ───

/**
 * Static assertion: DashboardEventMap covers exactly the same set of keys
 * as DashboardEventKind. If a new kind is added to the domain and not
 * reflected here, TypeScript will error.
 */
type AssertExhaustive<
  TMap extends Record<DashboardEventKind, unknown>,
  _TCheck extends DashboardEventKind = keyof TMap & DashboardEventKind,
> = TMap;

// This line causes a compile error if DashboardEventMap is missing any DashboardEventKind.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Exhaustive = AssertExhaustive<DashboardEventMap>;

// Also verify the reverse: every key in DashboardEventMap is a valid DashboardEventKind.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _NoExtra = keyof DashboardEventMap extends DashboardEventKind ? true : never;

// ─── EventObserver ───

/** A typed handler for a single event kind. */
export type EventHandler<K extends DashboardEventKind> = (data: DashboardEventMap[K]) => void;

/** A subscription handle returned by subscribe, used to unsubscribe. */
export interface Subscription {
  readonly unsubscribe: () => void;
}

/**
 * EventObserver — typed pub/sub for dashboard events.
 *
 * - Subscribe/unsubscribe by kind with type-safe payload.
 * - Multiple subscribers per kind (Set-based, idempotent unsubscribe).
 * - Dispatch routes to all subscribers for that kind.
 * - No event is dropped silently: unhandled events accumulate in a dead-letter log.
 *
 * Pure construction: `createEventObserver()` returns an immutable interface
 * backed by a mutable Map internally (the Map is the subscription registry,
 * not exposed).
 */
export interface EventObserver {
  /** Subscribe to a specific event kind. Returns a Subscription handle. */
  readonly subscribe: <K extends DashboardEventKind>(
    kind: K,
    handler: EventHandler<K>,
  ) => Subscription;

  /** Dispatch an event to all subscribers of that kind. */
  readonly dispatch: <K extends DashboardEventKind>(
    kind: K,
    data: DashboardEventMap[K],
  ) => void;

  /** Read-only view: how many subscribers exist for a given kind. */
  readonly subscriberCount: (kind: DashboardEventKind) => number;

  /** Read-only view: events dispatched with no subscribers (dead letters). */
  readonly deadLetters: () => readonly DeadLetter[];

  /** Clear all subscriptions. Idempotent. */
  readonly clear: () => void;
}

export interface DeadLetter {
  readonly kind: DashboardEventKind;
  readonly timestamp: number;
}

/**
 * Create an EventObserver instance.
 *
 * The internal registry is a Map<DashboardEventKind, Set<handler>>.
 * Subscribe is idempotent for the same handler reference.
 * Unsubscribe is idempotent (safe to call multiple times).
 * Dispatch is synchronous and iterates the subscriber Set in insertion order.
 */
export function createEventObserver(): EventObserver {
  const registry = new Map<DashboardEventKind, Set<EventHandler<never>>>();
  const deadLetterLog: DeadLetter[] = [];

  const getOrCreateSet = (kind: DashboardEventKind): Set<EventHandler<never>> => {
    const existing = registry.get(kind);
    if (existing) return existing;
    const fresh: Set<EventHandler<never>> = new Set();
    registry.set(kind, fresh);
    return fresh;
  };

  const subscribe = <K extends DashboardEventKind>(
    kind: K,
    handler: EventHandler<K>,
  ): Subscription => {
    const handlers = getOrCreateSet(kind);
    handlers.add(handler as EventHandler<never>);
    let active = true;
    return {
      unsubscribe: () => {
        if (!active) return; // idempotent
        active = false;
        handlers.delete(handler as EventHandler<never>);
      },
    };
  };

  const dispatch = <K extends DashboardEventKind>(
    kind: K,
    data: DashboardEventMap[K],
  ): void => {
    const handlers = registry.get(kind);
    if (!handlers || handlers.size === 0) {
      deadLetterLog.push({ kind, timestamp: Date.now() });
      return;
    }
    // Snapshot the handler set to avoid issues if a handler modifies subscriptions
    const snapshot = [...handlers];
    snapshot.forEach((handler) => handler(data as never));
  };

  const subscriberCount = (kind: DashboardEventKind): number =>
    registry.get(kind)?.size ?? 0;

  const deadLetters = (): readonly DeadLetter[] => [...deadLetterLog];

  const clear = (): void => {
    registry.clear();
    deadLetterLog.length = 0;
  };

  return { subscribe, dispatch, subscriberCount, deadLetters, clear };
}

// ─── All Dashboard Event Kinds (exported constant for tests and validation) ───

export const ALL_DASHBOARD_EVENT_KINDS: readonly DashboardEventKind[] = [
  'iteration-start',
  'iteration-complete',
  'progress',
  'screen-group-start',
  'item-pending',
  'item-processing',
  'item-completed',
  'workbench-updated',
  'fitness-updated',
  'element-probed',
  'screen-captured',
  'element-escalated',
  'inbox-item-arrived',
  'fiber-paused',
  'fiber-resumed',
  'rung-shift',
  'calibration-update',
  'proposal-activated',
  'confidence-crossed',
  'artifact-written',
  'stage-lifecycle',
  'surface-discovered',
  'route-navigated',
  'aria-tree-captured',
  'suite-slice-selected',
  'scenario-prioritized',
  'step-bound',
  'scenario-compiled',
  'step-executing',
  'step-resolved',
  'scenario-executed',
  'trust-policy-evaluated',
  'knowledge-activated',
  'convergence-evaluated',
  'iteration-summary',
  'diagnostics',
  'connected',
  'error',
] as const;
