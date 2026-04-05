import { Effect } from 'effect';
import type { DashboardPort } from '../ports';
import type { WorkItemDecider } from './agent-workbench';
import type { AgentWorkItem } from '../../domain/handshake/workbench';
import { dashboardEvent } from '../../domain/observation/dashboard';
import { type GovernanceVerdict, approved, suspended } from '../../domain/kernel/governed-suspension';

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

// ─── Governed Suspension bridge ──────────────────────────────────────────
//
// The dashboard decision flow is a GovernanceVerdict:
//   - Agent-routable items → Approved (handled without dashboard)
//   - Items needing human input → Suspended (awaits dashboard decision)
//
// This bridges the Effect-based dashboard flow with the pure algebra.

/**
 * Classify a work item as Approved (auto-decidable) or Suspended (needs dashboard).
 * This is a pure verdict — the Effect-based dashboard interaction is separate.
 */
export function dashboardDecisionVerdict(
  item: AgentWorkItem,
  isAutoDecidable: (item: AgentWorkItem) => boolean = () => false,
): GovernanceVerdict<AgentWorkItem, AgentWorkItem> {
  return isAutoDecidable(item)
    ? approved(item)
    : suspended(item, `Dashboard decision required: ${item.rationale}`);
}
