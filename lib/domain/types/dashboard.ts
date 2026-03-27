/**
 * Dashboard domain types — the contract between the Effect fiber and
 * the React view layer.
 *
 * The Effect fiber emits DashboardEvents as it progresses through the
 * improvement loop. The fiber pauses at decision points (awaitDecision)
 * and resumes when the human responds via the dashboard.
 *
 * This is NOT a UI concern — it's a domain contract. The WS adapter
 * (infrastructure) implements the transport. The React app (view)
 * renders the events. The fiber (domain) drives everything.
 */

import type { AgentWorkItem, WorkItemCompletion, ScreenGroupContext } from './workbench';
import type { SpeedrunProgressEvent } from './improvement';

export type DashboardEventKind =
  | 'iteration-start'
  | 'iteration-complete'
  | 'progress'
  | 'screen-group-start'
  | 'item-pending'
  | 'item-processing'
  | 'item-completed'
  | 'workbench-updated'
  | 'fitness-updated'
  | 'connected'
  | 'error';

export interface DashboardEvent {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly data: unknown;
}

export interface WorkItemDecision {
  readonly workItemId: string;
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
}

/** Build a dashboard event with current timestamp. Pure. */
export function dashboardEvent(type: DashboardEventKind, data: unknown): DashboardEvent {
  return { type, timestamp: new Date().toISOString(), data };
}
