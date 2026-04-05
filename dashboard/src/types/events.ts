/**
 * Typed event taxonomy for the Tesseract dashboard subscription system.
 */

import type {
  DashboardEventKind,
  DashboardEventMap,
  ScreenGroupStartPayload,
  ConnectedPayload,
  DiagnosticsPayload,
  ErrorPayload,
  IterationStartPayload,
  IterationCompletePayload,
  ItemPendingPayload,
  ItemProcessingPayload,
  ItemCompletedPayload,
} from '../../../lib/domain/observation/dashboard';
import { DASHBOARD_EVENT_KINDS } from '../../../lib/domain/observation/dashboard';

export type {
  DashboardEventKind,
  DashboardEventMap,
  ScreenGroupStartPayload,
  ConnectedPayload,
  DiagnosticsPayload,
  ErrorPayload,
  IterationStartPayload,
  IterationCompletePayload,
  ItemPendingPayload,
  ItemProcessingPayload,
  ItemCompletedPayload,
};

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

export const ALL_DASHBOARD_EVENT_KINDS: readonly DashboardEventKind[] = DASHBOARD_EVENT_KINDS;
