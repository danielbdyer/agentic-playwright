/**
 * WebSocket Dashboard Adapter — bridges the Effect fiber to connected React clients.
 *
 * Implements DashboardPort using:
 *   - Effect.sync for fire-and-forget event emission (broadcast to all clients)
 *   - Deferred + Ref registry for fiber-pausing decision awaiting (WS request-response)
 *
 * The pending decisions registry stores { workItemId → Deferred<WorkItemDecision> }.
 * Inbound 'decision' WS messages resolve the matching deferred through an Effect
 * entrypoint and emit 'item-completed'. Timeout auto-skips without JS timers.
 */

import { Deferred, Duration, Effect, Ref } from 'effect';
import type { DashboardPort } from '../../application/ports';
import type { DashboardEvent, WorkItemDecision } from '../../domain/observation/dashboard';
import type { AgentWorkItem } from '../../domain/handshake/workbench';
import { dashboardEvent } from '../../domain/observation/dashboard';
import { TesseractError } from '../../domain/kernel/errors';
import { RETRY_POLICIES, retryScheduleForTaggedErrors } from '../../application/resilience/schedules';

export interface WsBroadcaster {
  /** Send a JSON message to all connected WebSocket clients. */
  readonly broadcast: (data: unknown) => void;
  /** Register a handler for incoming WS messages from any client. */
  readonly onMessage: (handler: (msg: Record<string, unknown>) => void) => void;
}

class DashboardBridgeTransientError extends TesseractError {
  override readonly _tag = 'DashboardBridgeTransientError' as const;

  constructor(message: string, cause?: unknown) {
    super('dashboard-bridge-transient', message, cause);
    this.name = 'DashboardBridgeTransientError';
  }
}

function withBroadcastRetry(
  ws: WsBroadcaster,
  event: unknown,
): Effect.Effect<void, DashboardBridgeTransientError, never> {
  return Effect.try({
    try: () => {
      ws.broadcast(event);
    },
    catch: (cause) => new DashboardBridgeTransientError('Dashboard websocket broadcast failed', cause),
  }).pipe(
    Effect.retryOrElse(
      retryScheduleForTaggedErrors(RETRY_POLICIES.dashboardTransient, (error) => error._tag === 'DashboardBridgeTransientError'),
      (error) => Effect.fail(error),
    ),
  );
}

/** Create a DashboardPort backed by WebSocket broadcast + request-response.
 *  The `pendingDecisions` Map is the bridge between WS messages and Effect fibers. */
export function createWsDashboardAdapter(
  ws: WsBroadcaster,
  options?: { readonly decisionTimeoutMs?: number },
): DashboardPort {
  const timeoutMs = options?.decisionTimeoutMs ?? 60000;
  const pendingDecisions = Ref.unsafeMake(new Map<string, Deferred.Deferred<WorkItemDecision>>());

  const removePending = (workItemId: string) =>
    Ref.update(pendingDecisions, (map) => {
      const next = new Map(map);
      next.delete(workItemId);
      return next;
    });

  const parseDecisionMessage = (msg: Record<string, unknown>): WorkItemDecision | null => {
    if (msg.type !== 'decision' || typeof msg.workItemId !== 'string') return null;
    return {
      workItemId: msg.workItemId,
      status: msg.status === 'completed' ? 'completed' : 'skipped',
      rationale: typeof msg.rationale === 'string' ? msg.rationale : 'Dashboard decision',
    };
  };

  const resolveInboundDecision = (msg: Record<string, unknown>) => Effect.gen(function* () {
    const decision = parseDecisionMessage(msg);
    if (!decision) return;

    const deferred = yield* Ref.modify(pendingDecisions, (map) => {
      const next = new Map(map);
      const match = next.get(decision.workItemId);
      next.delete(decision.workItemId);
      return [match, next] as const;
    });

    if (!deferred) return;
    yield* Deferred.succeed(deferred, decision);
    yield* withBroadcastRetry(ws, dashboardEvent('item-completed', decision)).pipe(
      Effect.catchTag('DashboardBridgeTransientError', () => Effect.void),
    );
  });

  // Register WS message handler for decision responses
  ws.onMessage((msg) => {
    Effect.runFork(resolveInboundDecision(msg));
  });

  return {
    emit: (event: DashboardEvent) => withBroadcastRetry(ws, event).pipe(
      Effect.catchTag('DashboardBridgeTransientError', () => Effect.void),
    ),

    awaitDecision: (item: AgentWorkItem) => Effect.gen(function* () {
      const timeoutDecision: WorkItemDecision = {
        workItemId: item.id,
        status: 'skipped',
        rationale: `Dashboard timeout (${timeoutMs / 1000}s)`,
      };

      yield* withBroadcastRetry(ws, dashboardEvent('item-pending', item)).pipe(
        Effect.catchTag('DashboardBridgeTransientError', () => Effect.void),
      );

      const deferred = yield* Deferred.make<WorkItemDecision>();
      yield* Ref.update(pendingDecisions, (map) => new Map([...map, [item.id, deferred]]));

      return yield* Deferred.await(deferred).pipe(
        Effect.timeout(Duration.millis(timeoutMs)),
        Effect.catchTag('TimeoutException', () => withBroadcastRetry(ws, dashboardEvent('item-completed', timeoutDecision)).pipe(
          Effect.catchTag('DashboardBridgeTransientError', () => Effect.void),
          Effect.as(timeoutDecision),
        )),
        Effect.ensuring(removePending(item.id)),
      );
    }),
  };
}
