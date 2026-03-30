import { Effect } from 'effect';
import type { DashboardPort } from './ports';
import type { WorkItemDecider } from './agent-workbench';
import { dashboardEvent } from '../domain/types';

/** Create a WorkItemDecider that routes decisions through the dashboard.
 *  Pure factory: DashboardPort → WorkItemDecider. */
export function createDashboardDecider(dashboard: DashboardPort): WorkItemDecider {
  return (item) => Effect.gen(function* () {
    yield* dashboard.emit(dashboardEvent('item-processing', { workItemId: item.id }));

    yield* dashboard.emit(dashboardEvent('fiber-paused', {
      workItemId: item.id,
      reason: item.rationale,
      screen: item.context?.screen ?? 'unknown',
      element: item.context?.element ?? null,
    }));

    const decision = yield* dashboard.awaitDecision(item);

    yield* dashboard.emit(dashboardEvent('fiber-resumed', {
      workItemId: item.id,
      decision: decision.status,
    }));

    return {
      status: decision.status,
      rationale: decision.rationale,
    } as const;
  });
}
