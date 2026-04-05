import type { DashboardEventKind } from './events';

export interface DashboardEvent {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly data: unknown;
}

/** Build a dashboard event with current timestamp. Pure. */
export function dashboardEvent(type: DashboardEventKind, data: unknown): DashboardEvent {
  return { type, timestamp: new Date().toISOString(), data };
}
