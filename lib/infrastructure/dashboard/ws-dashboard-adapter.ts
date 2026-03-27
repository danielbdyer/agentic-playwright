/**
 * WebSocket Dashboard Adapter — bridges the Effect fiber to connected React clients.
 *
 * Implements DashboardPort using:
 *   - Effect.sync for fire-and-forget event emission (broadcast to all clients)
 *   - Effect.async for fiber-pausing decision awaiting (WS request-response)
 *
 * The pending decisions Map stores { workItemId → resume callback }.
 * When a 'decision' message arrives over WS, the corresponding fiber resumes.
 * Timeout (configurable, default 60s) auto-skips if no human responds.
 */

import { Effect } from 'effect';
import type { DashboardPort } from '../../application/ports';
import type { DashboardEvent, WorkItemDecision } from '../../domain/types';
import type { AgentWorkItem } from '../../domain/types';
import { dashboardEvent } from '../../domain/types';

export interface WsBroadcaster {
  /** Send a JSON message to all connected WebSocket clients. */
  readonly broadcast: (data: unknown) => void;
  /** Register a handler for incoming WS messages from any client. */
  readonly onMessage: (handler: (msg: Record<string, unknown>) => void) => void;
}

/** Create a DashboardPort backed by WebSocket broadcast + request-response.
 *  The `pendingDecisions` Map is the bridge between WS messages and Effect fibers. */
export function createWsDashboardAdapter(
  ws: WsBroadcaster,
  options?: { readonly decisionTimeoutMs?: number },
): DashboardPort {
  const timeoutMs = options?.decisionTimeoutMs ?? 60000;
  const pendingDecisions = new Map<string, (decision: WorkItemDecision) => void>();

  // Register WS message handler for decision responses
  ws.onMessage((msg) => {
    if (msg.type === 'decision' && typeof msg.workItemId === 'string') {
      const resolver = pendingDecisions.get(msg.workItemId);
      if (resolver) {
        pendingDecisions.delete(msg.workItemId);
        resolver({
          workItemId: msg.workItemId as string,
          status: (msg.status as 'completed' | 'skipped') ?? 'skipped',
          rationale: (msg.rationale as string) ?? 'Dashboard decision',
        });
      }
    }
  });

  return {
    emit: (event: DashboardEvent) => Effect.sync(() => {
      ws.broadcast(event);
    }),

    awaitDecision: (item: AgentWorkItem) => Effect.async<WorkItemDecision, never, never>((resume) => {
      // 1. Broadcast 'item-pending' to all clients
      ws.broadcast(dashboardEvent('item-pending', item));

      // 2. Register resolver — fiber pauses here
      pendingDecisions.set(item.id, (decision) => {
        // Broadcast 'item-completed' when decision arrives
        ws.broadcast(dashboardEvent('item-completed', decision));
        resume(Effect.succeed(decision));
      });

      // 3. Timeout: auto-skip if no human responds
      const timer = setTimeout(() => {
        if (pendingDecisions.has(item.id)) {
          pendingDecisions.delete(item.id);
          const timeoutDecision: WorkItemDecision = {
            workItemId: item.id,
            status: 'skipped',
            rationale: `Dashboard timeout (${timeoutMs / 1000}s)`,
          };
          ws.broadcast(dashboardEvent('item-completed', timeoutDecision));
          resume(Effect.succeed(timeoutDecision));
        }
      }, timeoutMs);

      // Cleanup on fiber interruption
      return Effect.sync(() => {
        clearTimeout(timer);
        pendingDecisions.delete(item.id);
      });
    }),
  };
}
