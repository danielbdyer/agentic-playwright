/**
 * Dashboard Decider — bridges DashboardPort to WorkItemDecider.
 *
 * The DashboardPort operates in the Effect world (Effect.async for fiber pause).
 * The WorkItemDecider operates in the Promise world (processWorkItems expects it).
 * This bridge converts between the two: Effect → Promise via Effect.runPromise.
 *
 * Flow: fiber calls decider(item) → decider emits 'item-processing' → calls
 * awaitDecision → fiber pauses → human clicks in React → WS message arrives →
 * resolver fires → fiber resumes → decider returns decision.
 */

import { Effect } from 'effect';
import type { DashboardPort } from './ports';
import type { WorkItemDecider } from './agent-workbench';
import { dashboardEvent } from '../domain/types';

/** Create a WorkItemDecider that routes decisions through the dashboard.
 *  Pure factory: DashboardPort → WorkItemDecider. */
export function createDashboardDecider(dashboard: DashboardPort): WorkItemDecider {
  return async (item) => {
    // 1. Emit 'item-processing' — React highlights the item
    await Effect.runPromise(
      dashboard.emit(dashboardEvent('item-processing', { workItemId: item.id })),
    );

    // 2. Emit 'fiber-paused' — dashboard shows pause indicator
    await Effect.runPromise(
      dashboard.emit(dashboardEvent('fiber-paused', {
        workItemId: item.id,
        reason: item.rationale,
        screen: item.context?.screen ?? 'unknown',
        element: item.context?.element ?? null,
      })),
    );

    // 3. Await human decision — fiber pauses until the human clicks (or auto-skips)
    const decision = await Effect.runPromise(dashboard.awaitDecision(item));

    // 4. Emit 'fiber-resumed' — dashboard clears pause indicator
    await Effect.runPromise(
      dashboard.emit(dashboardEvent('fiber-resumed', {
        workItemId: item.id,
        decision: decision.status,
      })),
    );

    // 5. Return the decision to the processWorkItems loop
    return {
      status: decision.status,
      rationale: decision.rationale,
    };
  };
}
